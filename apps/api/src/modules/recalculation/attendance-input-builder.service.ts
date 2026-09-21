import { Injectable } from '@nestjs/common';
import {
  applyLeave,
  DailyCalculationInput,
  HolidayStatusEntry,
  PunchEvent,
  PunchType,
} from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isValidBreakNotGrantedPayload, parsePunchCorrectionPayload, PUNCH_AFFECTING_REASON_CODES } from '../../common/correction/correction-payload.util';
import { addDays, dateOnly } from '../../common/time/week.util';

export interface ScheduleSnapshot {
  siteId: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  plannedBreakMinutes: number | null;
  scheduledWorkMinutes: number | null;
}

export interface BuiltDailyInput {
  employeeId: string;
  workDate: string;
  siteId: string;
  input: DailyCalculationInput;
  /** 해시에 포함할 원본 스냅샷 — resolvedPolicyConfig까지 합쳐 recalculation.service.ts가 해시한다. */
  rawSnapshot: Record<string, unknown>;
  warnings: string[];
}

/**
 * (employeeId, workDate) → core-rules DailyCalculationInput 조립.
 * punch_raw / schedule / leave_request / correction_request / holiday_calendar /
 * site_headcount_history / overtime_request를 조회해 순수 함수 엔진이 먹을 수 있는
 * 형태로 바꾼다. 이 서비스 자체는 계산하지 않는다 — 오직 매핑만 한다.
 */
@Injectable()
export class AttendanceInputBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  async build(employeeId: string, workDate: string): Promise<BuiltDailyInput> {
    const warnings: string[] = [];

    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const schedule = await this.gatherSchedule(employeeId, workDate);
    const siteId = await this.resolveSiteId(employeeId, workDate, schedule, employee.primarySiteId);

    const [punches, holidayStatusByCalendarDate, isUnderFiveEmployees, overtimeApproved, workNotProvidedJudgment, breakNotGrantedReported] =
      await Promise.all([
        this.gatherEffectivePunches(employeeId, workDate),
        this.gatherHolidayStatus(siteId, workDate),
        this.resolveIsUnderFive(siteId, workDate),
        this.resolveOvertimeApproved(employeeId, workDate),
        this.resolveWorkNotProvidedJudgment(employeeId, workDate),
        this.resolveBreakNotGrantedReported(employeeId, workDate),
      ]);

    const leave = await this.resolvePaidLeaveMinutes(
      employeeId,
      workDate,
      schedule.scheduledWorkMinutes,
      employee.contractedWorkMinutes,
    );
    if (leave.warning) warnings.push(leave.warning);

    const input: DailyCalculationInput = {
      workDate,
      scheduledStartAt: schedule.plannedStartAt,
      scheduledEndAt: schedule.plannedEndAt,
      scheduledBreakSegments: this.synthesizeBreakSegment(schedule),
      punches,
      breakNotGrantedReported,
      holidayStatusByCalendarDate,
      isUnderFiveEmployees,
      overtimeApproved,
      workNotProvidedJudgment,
      // Employee.contractedWorkMinutes는 "주" 단위라 일 단위로 임의 변환하지 않는다.
      contractedDailyWorkMinutes: null,
      paidLeaveMinutes: leave.minutes,
    };

    return {
      employeeId,
      workDate,
      siteId,
      input,
      rawSnapshot: {
        punches,
        schedule,
        holidayStatusByCalendarDate,
        isUnderFiveEmployees,
        overtimeApproved,
        workNotProvidedJudgment,
        breakNotGrantedReported,
        leave,
      },
      warnings,
    };
  }

  private async resolveSiteId(
    employeeId: string,
    workDate: string,
    schedule: ScheduleSnapshot,
    primarySiteId: string,
  ): Promise<string> {
    if (schedule.siteId) return schedule.siteId;
    const punch = await this.prisma.punchRaw.findFirst({
      where: { employeeId, workDate: dateOnly(workDate) },
      orderBy: { recordedAt: 'asc' },
      select: { siteId: true },
    });
    return punch?.siteId ?? primarySiteId;
  }

  private async gatherEffectivePunches(employeeId: string, workDate: string): Promise<PunchEvent[]> {
    const rawPunches = await this.prisma.punchRaw.findMany({
      where: { employeeId, workDate: dateOnly(workDate) },
      orderBy: { recordedAt: 'asc' },
    });

    const effective: PunchEvent[] = rawPunches.map((p) => ({
      type: p.punchType as PunchType,
      recordedAt: p.recordedAt.toISOString(),
    }));
    const indexByPunchId = new Map<string, number>();
    rawPunches.forEach((p, i) => indexByPunchId.set(p.id, i));

    // ★ PUNCH_MISSING/DEVICE_ERROR/NETWORK_FAILURE만 펀치로 해석한다.
    // SCHEDULE_CHANGE/DISPATCH/LOCATION_ERROR/OTHER는 펀치 모양이 아니라 이번
    // STEP에서 계산에 반영하지 않는다(승인은 기록되지만 여기서는 무시).
    const corrections = await this.prisma.correctionRequest.findMany({
      where: {
        employeeId,
        targetWorkDate: dateOnly(workDate),
        status: { in: ['APPROVED_L1', 'APPROVED_L2'] },
        reasonCode: { in: [...PUNCH_AFFECTING_REASON_CODES] },
      },
    });

    for (const correction of corrections) {
      const payload = parsePunchCorrectionPayload(correction);
      if (correction.targetPunchId && indexByPunchId.has(correction.targetPunchId)) {
        effective[indexByPunchId.get(correction.targetPunchId)!] = payload;
      } else {
        effective.push(payload);
      }
    }

    return effective.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  }

  /** STEP8: 승인된 BREAK_NOT_GRANTED 정정이 있으면 스케줄상 휴게보다 우선한다(CLAUDE.md 절대 규칙 3). */
  private async resolveBreakNotGrantedReported(employeeId: string, workDate: string): Promise<boolean> {
    const corrections = await this.prisma.correctionRequest.findMany({
      where: {
        employeeId,
        targetWorkDate: dateOnly(workDate),
        status: { in: ['APPROVED_L1', 'APPROVED_L2'] },
        reasonCode: 'BREAK_NOT_GRANTED',
      },
    });
    return corrections.some((c) => isValidBreakNotGrantedPayload(c.afterValue));
  }

  private async gatherSchedule(employeeId: string, workDate: string): Promise<ScheduleSnapshot> {
    const schedule = await this.prisma.schedule.findFirst({
      where: { employeeId, workDate: dateOnly(workDate) },
    });
    if (!schedule) {
      return { siteId: null, plannedStartAt: null, plannedEndAt: null, plannedBreakMinutes: null, scheduledWorkMinutes: null };
    }
    const spanMinutes = Math.floor((schedule.plannedEndAt.getTime() - schedule.plannedStartAt.getTime()) / 60000);
    return {
      siteId: schedule.siteId,
      plannedStartAt: schedule.plannedStartAt.toISOString(),
      plannedEndAt: schedule.plannedEndAt.toISOString(),
      plannedBreakMinutes: schedule.plannedBreakMinutes,
      scheduledWorkMinutes: Math.max(0, spanMinutes - schedule.plannedBreakMinutes),
    };
  }

  /**
   * Schedule.plannedBreakMinutes(정수)만 있고 명시적 휴게 시각 컬럼이 없다.
   * 실제 타각이 있으면 core-rules가 이 값을 완전히 무시하므로, 여기서는 표시용
   * 앵커만 "스케줄 중간 지점"에 합성해 둔다(체류 시작점에 붙이면 야간 교대
   * 근무의 휴게가 항상 시작 시각으로 쏠려 야간 분류가 틀어진다).
   */
  private synthesizeBreakSegment(schedule: ScheduleSnapshot): { startAt: string; endAt: string }[] {
    if (!schedule.plannedStartAt || !schedule.plannedEndAt || !schedule.plannedBreakMinutes) return [];
    if (schedule.plannedBreakMinutes <= 0) return [];

    const startMs = Date.parse(schedule.plannedStartAt);
    const endMs = Date.parse(schedule.plannedEndAt);
    const spanMinutes = Math.floor((endMs - startMs) / 60000);
    const preBreakMinutes = Math.floor(Math.max(0, spanMinutes - schedule.plannedBreakMinutes) / 2);
    const breakStart = new Date(startMs + preBreakMinutes * 60000);
    const breakEnd = new Date(breakStart.getTime() + schedule.plannedBreakMinutes * 60000);
    return [{ startAt: breakStart.toISOString(), endAt: breakEnd.toISOString() }];
  }

  private async gatherHolidayStatus(siteId: string, workDate: string): Promise<HolidayStatusEntry[]> {
    const dates = [workDate, addDays(workDate, 1)];
    const results: HolidayStatusEntry[] = [];
    for (const d of dates) {
      const dObj = dateOnly(d);
      const allScope = await this.prisma.holidayCalendar.findFirst({
        where: { holidayDate: dObj, scopeType: 'ALL' },
      });
      if (allScope) {
        results.push({ calendarDate: d, isHoliday: true });
        continue;
      }
      const siteScope = await this.prisma.holidayCalendar.findFirst({
        where: { holidayDate: dObj, scopeType: 'SITE_LIST', sites: { some: { siteId } } },
      });
      results.push({ calendarDate: d, isHoliday: siteScope != null });
    }
    return results;
  }

  private async resolveIsUnderFive(siteId: string, workDate: string): Promise<boolean> {
    const dObj = dateOnly(workDate);
    const row = await this.prisma.siteHeadcountHistory.findFirst({
      where: {
        siteId,
        effectiveStartDate: { lte: dObj },
        OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: dObj } }],
      },
      orderBy: { effectiveStartDate: 'desc' },
    });
    // 이력이 없으면 "5인 이상"(가산 적용)으로 간주한다 — 실근로 보상을 조용히
    // 줄이는 방향이 아니라 늘리는 방향으로 기본값을 잡는다.
    return row?.isUnderFive ?? false;
  }

  private async resolveOvertimeApproved(employeeId: string, workDate: string): Promise<boolean | null> {
    const approved = await this.prisma.overtimeRequest.findFirst({
      where: { employeeId, targetDate: dateOnly(workDate), status: 'APPROVED' },
    });
    return approved ? true : null;
  }

  private async resolveWorkNotProvidedJudgment(
    employeeId: string,
    workDate: string,
  ): Promise<DailyCalculationInput['workNotProvidedJudgment']> {
    const row = await this.prisma.workNotProvidedJudgment.findUnique({
      where: { employeeId_workDate: { employeeId, workDate: dateOnly(workDate) } },
    });
    if (!row) return null;
    return { judged: true, reason: row.reason, judgedAt: row.judgedAt.toISOString(), judgedBy: row.judgedBy };
  }

  private async resolvePaidLeaveMinutes(
    employeeId: string,
    workDate: string,
    scheduledWorkMinutesForDay: number | null,
    employeeWeeklyContractedMinutes: number | null,
  ): Promise<{ minutes: number; warning?: string }> {
    const dObj = dateOnly(workDate);
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { employeeId, status: 'APPROVED', startDate: { lte: dObj }, endDate: { gte: dObj } },
    });
    if (!leave) return { minutes: 0 };

    let contractedDailyWorkMinutes: number;
    let warning: string | undefined;
    if (scheduledWorkMinutesForDay != null) {
      contractedDailyWorkMinutes = scheduledWorkMinutesForDay;
    } else if (employeeWeeklyContractedMinutes != null) {
      // 임시 근사치 — "표준 일일 소정근로시간" 정책값이 생기면 교체한다.
      contractedDailyWorkMinutes = Math.floor(employeeWeeklyContractedMinutes / 5);
      warning = `${workDate}: 그날 Schedule이 없어 Employee.contractedWorkMinutes(주 단위)/5로 ` +
        `휴가 환산 기준을 근사했습니다. 검토가 필요합니다.`;
    } else {
      contractedDailyWorkMinutes = 0;
      warning = `${workDate}: 휴가 환산 기준(스케줄도, 주 소정근로시간도)이 없어 ` +
        `유급 시간을 0으로 처리했습니다 — 검토가 필요합니다.`;
    }

    const result = applyLeave({ unit: leave.unit, contractedDailyWorkMinutes, status: 'APPROVED' });
    return { minutes: result.paidLeaveMinutes, warning };
  }
}
