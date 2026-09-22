import { Injectable } from '@nestjs/common';
import { numberConsecutiveWorkdays } from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { monthRange } from '../../common/time/week.util';
import { PayrollStatementComputationService } from '../payroll-close/payroll-statement-computation.service';

export interface ScheduleVsActualRow {
  scheduleId: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  workDate: string;
  status: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  /** AttendanceDaily 산출 결과가 아직 없으면 null(단정하지 않는다 — 재계산 미실행/미래일 가능성). */
  actualExists: boolean;
  isAbsence: boolean | null;
  latenessMinutes: number | null;
  earlyLeaveMinutes: number | null;
  scheduledExcessMinutes: number | null;
  actualWorkMinutes: number | null;
}

export interface ActualReportDayRow {
  workDate: string;
  scheduleStatus: string | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  actualExists: boolean;
  isAbsence: boolean | null;
  latenessMinutes: number | null;
  earlyLeaveMinutes: number | null;
  actualWorkMinutes: number | null;
  approvedOvertimeMinutes: number | null;
  unapprovedOvertimeMinutes: number | null;
  nightWorkMinutes: number | null;
  holidayWorkMinutesNormal: number | null;
  holidayWorkMinutesExcess: number | null;
  /** 연속 근무 구간 안에서의 순번(6일차 표기용) — 정보 표시용, 임금 산정과 무관. */
  consecutiveDayNumber: number | null;
  /** 그날 귀속 임금(연장/야간/휴일 가산 포함). MONTHLY 급여제라도 항상 일단위로
   * 강제 계산해 받는다(compute()의 layoutOverride 참고). */
  dailyWageAmount: number | null;
}

export interface ActualReportWeekSummary {
  weekStartDate: string;
  weeklyPaidRestEligible: boolean;
  weeklyPaidRestMinutes: number;
  weeklyPaidRestPayAmount: number;
}

export interface ActualReportEmployeeRow {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  days: ActualReportDayRow[];
  weeklySummaries: ActualReportWeekSummary[];
  monthTotal: {
    actualWorkMinutes: number;
    approvedOvertimeMinutes: number;
    unapprovedOvertimeMinutes: number;
    holidayWorkMinutesNormal: number;
    holidayWorkMinutesExcess: number;
    weeklyPaidRestPayAmount: number;
    totalWageAmount: number;
  };
}

/** 계획 대비 실적(요구사항6) — AttendanceDaily(STEP3 산출물)가 이미
 * lateness/earlyLeave/scheduledExcess/isAbsence를 계산해 두므로, 여기서
 * 재계산하지 않고 Schedule과 조인해 보여주기만 한다. */
@Injectable()
export class ScheduleReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payrollComputation: PayrollStatementComputationService,
  ) {}

  async scheduleVsActual(scope: OrgScope, siteId: string, yearMonth: string): Promise<ScheduleVsActualRow[]> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const { start, end } = monthRange(yearMonth);

    const [schedules, dailies] = await Promise.all([
      this.prisma.schedule.findMany({
        where: { siteId, workDate: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
        include: { employee: { select: { employeeNo: true, name: true } } },
        orderBy: [{ workDate: 'asc' }, { employeeId: 'asc' }],
      }),
      this.prisma.attendanceDaily.findMany({ where: { siteId, workDate: { gte: start, lt: end } } }),
    ]);

    const dailyByKey = new Map(dailies.map((d) => [`${d.employeeId}:${d.workDate.toISOString().slice(0, 10)}`, d]));

    return schedules.map((s) => {
      const workDate = s.workDate.toISOString().slice(0, 10);
      const actual = dailyByKey.get(`${s.employeeId}:${workDate}`);
      return {
        scheduleId: s.id,
        employeeId: s.employeeId,
        employeeNo: s.employee.employeeNo,
        employeeName: s.employee.name,
        workDate,
        status: s.status,
        plannedStartAt: s.plannedStartAt,
        plannedEndAt: s.plannedEndAt,
        actualExists: actual != null,
        isAbsence: actual?.isAbsence ?? null,
        latenessMinutes: actual?.latenessMinutes ?? null,
        earlyLeaveMinutes: actual?.earlyLeaveMinutes ?? null,
        scheduledExcessMinutes: actual?.scheduledExcessMinutes ?? null,
        actualWorkMinutes: actual?.actualWorkMinutes ?? null,
      };
    });
  }

  /**
   * 근무스케쥴(실적) 리포트(수정사항). 직원별로 그룹핑해 계획/실적 조인에
   * 연장·야간·휴일·일급·6일차·주휴 요약까지 더한다. 임금·주휴 계산은 여기서
   * 새로 하지 않고 PayrollStatementComputationService(급여마감과 동일 로직)를
   * 그대로 재사용한다 — 급여마감 여부와 무관하게 미리보기로 호출한다.
   */
  async actualReport(scope: OrgScope, siteId: string, yearMonth: string): Promise<ActualReportEmployeeRow[]> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const { start, end } = monthRange(yearMonth);

    const [schedules, dailies, wageLines, weeklyRows] = await Promise.all([
      this.prisma.schedule.findMany({
        where: { siteId, workDate: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
        include: { employee: { select: { employeeNo: true, name: true } } },
        orderBy: [{ workDate: 'asc' }, { employeeId: 'asc' }],
      }),
      this.prisma.attendanceDaily.findMany({
        where: { siteId, workDate: { gte: start, lt: end } },
        include: { employee: { select: { employeeNo: true, name: true } } },
      }),
      this.payrollComputation.compute(siteId, yearMonth, 'DAILY'),
      this.payrollComputation.computeWeeklyPaidRestSummary(siteId, yearMonth),
    ]);

    const employeeInfo = new Map<string, { employeeNo: string; name: string }>();
    for (const s of schedules) employeeInfo.set(s.employeeId, s.employee);
    for (const d of dailies) employeeInfo.set(d.employeeId, d.employee);

    const scheduleByKey = new Map(schedules.map((s) => [`${s.employeeId}:${s.workDate.toISOString().slice(0, 10)}`, s]));
    const dailyByKey = new Map(dailies.map((d) => [`${d.employeeId}:${d.workDate.toISOString().slice(0, 10)}`, d]));
    const wageByKey = new Map(wageLines.filter((l) => l.workDate).map((l) => [`${l.employeeId}:${l.workDate}`, l]));

    const weeklyByEmployee = new Map<string, ActualReportWeekSummary[]>();
    for (const w of weeklyRows) {
      const list = weeklyByEmployee.get(w.employeeId) ?? [];
      list.push({
        weekStartDate: w.weekStartDate,
        weeklyPaidRestEligible: w.eligible,
        weeklyPaidRestMinutes: w.minutes,
        weeklyPaidRestPayAmount: w.payAmount,
      });
      weeklyByEmployee.set(w.employeeId, list);
    }

    // 계획(Schedule) 또는 실적(AttendanceDaily) 중 하나라도 있는 날의 합집합을 그 직원의 표시 대상일로 삼는다.
    const workDatesByEmployee = new Map<string, Set<string>>();
    const addWorkDate = (employeeId: string, workDate: string) => {
      const set = workDatesByEmployee.get(employeeId) ?? new Set<string>();
      set.add(workDate);
      workDatesByEmployee.set(employeeId, set);
    };
    for (const s of schedules) addWorkDate(s.employeeId, s.workDate.toISOString().slice(0, 10));
    for (const d of dailies) addWorkDate(d.employeeId, d.workDate.toISOString().slice(0, 10));

    const results: ActualReportEmployeeRow[] = [];
    for (const [employeeId, info] of employeeInfo) {
      const workDates = [...(workDatesByEmployee.get(employeeId) ?? new Set<string>())].sort();

      // 6일차 순번(정보 표시용)은 실제로 근무한 날만 대상으로 한다 — 계획만 있고
      // 결근/미집행인 날은 연속 근무 구간에 포함하지 않는다.
      const actualWorkedDates = workDates.filter((wd) => (dailyByKey.get(`${employeeId}:${wd}`)?.actualWorkMinutes ?? 0) > 0);
      const consecutiveByDate = new Map(numberConsecutiveWorkdays(actualWorkedDates).map((r) => [r.workDate, r.consecutiveDayNumber]));

      const days: ActualReportDayRow[] = workDates.map((workDate) => {
        const schedule = scheduleByKey.get(`${employeeId}:${workDate}`);
        const actual = dailyByKey.get(`${employeeId}:${workDate}`);
        const wage = wageByKey.get(`${employeeId}:${workDate}`);
        return {
          workDate,
          scheduleStatus: schedule?.status ?? null,
          plannedStartAt: schedule?.plannedStartAt ?? null,
          plannedEndAt: schedule?.plannedEndAt ?? null,
          actualExists: actual != null,
          isAbsence: actual?.isAbsence ?? null,
          latenessMinutes: actual?.latenessMinutes ?? null,
          earlyLeaveMinutes: actual?.earlyLeaveMinutes ?? null,
          actualWorkMinutes: actual?.actualWorkMinutes ?? null,
          approvedOvertimeMinutes: actual?.approvedOvertimeMinutes ?? null,
          unapprovedOvertimeMinutes: actual?.unapprovedOvertimeMinutes ?? null,
          nightWorkMinutes: actual?.nightWorkMinutes ?? null,
          holidayWorkMinutesNormal: actual?.holidayWorkMinutesNormal ?? null,
          holidayWorkMinutesExcess: actual?.holidayWorkMinutesExcess ?? null,
          consecutiveDayNumber: consecutiveByDate.get(workDate) ?? null,
          dailyWageAmount: wage?.totalPayAmount ?? null,
        };
      });

      const weeklySummaries = (weeklyByEmployee.get(employeeId) ?? []).sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));
      const weeklyPaidRestPayAmount = weeklySummaries.reduce((sum, w) => sum + w.weeklyPaidRestPayAmount, 0);

      const dayTotals = days.reduce(
        (acc, d) => ({
          actualWorkMinutes: acc.actualWorkMinutes + (d.actualWorkMinutes ?? 0),
          approvedOvertimeMinutes: acc.approvedOvertimeMinutes + (d.approvedOvertimeMinutes ?? 0),
          unapprovedOvertimeMinutes: acc.unapprovedOvertimeMinutes + (d.unapprovedOvertimeMinutes ?? 0),
          holidayWorkMinutesNormal: acc.holidayWorkMinutesNormal + (d.holidayWorkMinutesNormal ?? 0),
          holidayWorkMinutesExcess: acc.holidayWorkMinutesExcess + (d.holidayWorkMinutesExcess ?? 0),
          dailyWageSum: acc.dailyWageSum + (d.dailyWageAmount ?? 0),
        }),
        {
          actualWorkMinutes: 0,
          approvedOvertimeMinutes: 0,
          unapprovedOvertimeMinutes: 0,
          holidayWorkMinutesNormal: 0,
          holidayWorkMinutesExcess: 0,
          dailyWageSum: 0,
        },
      );
      // 주휴수당은 일자별 값이 아니라 주 단위 값이므로 일급 합계와 별도로 한 번만 더한다.
      const monthTotal = {
        actualWorkMinutes: dayTotals.actualWorkMinutes,
        approvedOvertimeMinutes: dayTotals.approvedOvertimeMinutes,
        unapprovedOvertimeMinutes: dayTotals.unapprovedOvertimeMinutes,
        holidayWorkMinutesNormal: dayTotals.holidayWorkMinutesNormal,
        holidayWorkMinutesExcess: dayTotals.holidayWorkMinutesExcess,
        weeklyPaidRestPayAmount,
        totalWageAmount: dayTotals.dailyWageSum + weeklyPaidRestPayAmount,
      };

      results.push({
        employeeId,
        employeeNo: info.employeeNo,
        employeeName: info.name,
        days,
        weeklySummaries,
        monthTotal,
      });
    }

    results.sort((a, b) => a.employeeNo.localeCompare(b.employeeNo));
    return results;
  }
}
