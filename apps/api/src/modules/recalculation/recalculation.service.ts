import { Injectable, Logger } from '@nestjs/common';
import { AttendanceDaily, AttendanceDailyStatus, Prisma } from '@prisma/client';
import {
  calculateDailyAttendance,
  calculateWeeklyOvertimePay,
  checkWeeklyLimitViolation,
  DailyTotal,
  determineWeeklyPaidRest,
  ReviewFlag,
} from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { canonicalJson, sha256 } from '../../common/crypto/hash.util';
import { Principal } from '../../common/principal/principal.types';
import { AttendanceInputBuilderService } from './attendance-input-builder.service';
import { PolicyConfigResolverService } from './policy-config-resolver.service';
import { LaborAgreementResolverService } from './labor-agreement-resolver.service';
import { CALC_ENGINE_VERSION } from './calc-engine-version';
import { PayrollPeriodClosedError } from './errors/recalculation-errors';
import { addDays, dateOnly, enumerateDates, mondayOfWeek, monthRange, yearMonthOf } from '../../common/time/week.util';

interface MonthlyTotals {
  scheduledWorkMinutes: number;
  actualWorkMinutes: number;
  approvedOvertimeMinutes: number;
  unapprovedOvertimeMinutes: number;
  nightWorkMinutes: number;
  holidayWorkMinutesNormal: number;
  holidayWorkMinutesExcess: number;
  paidLeaveMinutes: number;
  absenceDays: number;
}

const EMPTY_MONTHLY_TOTALS: MonthlyTotals = {
  scheduledWorkMinutes: 0,
  actualWorkMinutes: 0,
  approvedOvertimeMinutes: 0,
  unapprovedOvertimeMinutes: 0,
  nightWorkMinutes: 0,
  holidayWorkMinutesNormal: 0,
  holidayWorkMinutesExcess: 0,
  paidLeaveMinutes: 0,
  absenceDays: 0,
};

/**
 * STEP1 스키마 ↔ STEP3 계산 엔진을 잇는 오케스트레이션의 핵심.
 * (employeeId, workDate) 단위 재계산 → 같은 호출 안에서 주/월 전파까지 수행한다.
 */
@Injectable()
export class RecalculationService {
  private readonly logger = new Logger(RecalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inputBuilder: AttendanceInputBuilderService,
    private readonly policyConfigResolver: PolicyConfigResolverService,
    private readonly laborAgreementResolver: LaborAgreementResolverService,
  ) {}

  async recalculateSingleDay(employeeId: string, workDate: string, principal: Principal): Promise<AttendanceDaily> {
    const built = await this.inputBuilder.build(employeeId, workDate);
    await this.assertPayrollOpen(built.siteId, workDate);
    const policy = await this.policyConfigResolver.resolve(built.siteId, workDate);

    const result = calculateDailyAttendance(built.input, policy);
    const inputSnapshotHash = sha256(canonicalJson({ ...built.rawSnapshot, resolvedPolicyConfig: policy }));
    const calculatedAt = new Date();
    const data = this.toAttendanceDailyData(result, inputSnapshotHash, calculatedAt);

    for (const warning of built.warnings) {
      this.logger.warn(`[${employeeId} ${workDate}] ${warning}`);
    }
    if (data.status !== 'NORMAL') {
      const actor = principal.kind === 'SYSTEM' ? `SYSTEM(job=${principal.jobId})` : principal.employeeNo;
      this.logger.warn(`[${employeeId} ${workDate}] status=${data.status} actor=${actor}`);
    }

    const saved = await this.prisma.attendanceDaily.upsert({
      where: { employeeId_workDate: { employeeId, workDate: dateOnly(workDate) } },
      create: { employeeId, siteId: built.siteId, workDate: dateOnly(workDate), ...data },
      update: { siteId: built.siteId, ...data },
    });

    await this.recalculateWeek(employeeId, mondayOfWeek(workDate));
    await this.recalculateMonth(employeeId, yearMonthOf(workDate));

    return saved;
  }

  /** 관리자 직접 호출 전용(백필 등). 날짜별로 순차 실행하고, 실패한 날짜를 건너뛰지 않고 전부 모아 던진다. */
  async recalculateRange(employeeId: string, fromDate: string, toDate: string, principal: Principal): Promise<AttendanceDaily[]> {
    const results: AttendanceDaily[] = [];
    const errors: Error[] = [];
    for (const workDate of enumerateDates(fromDate, toDate)) {
      try {
        results.push(await this.recalculateSingleDay(employeeId, workDate, principal));
      } catch (err) {
        errors.push(err as Error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `${employeeId} ${fromDate}~${toDate} 중 ${errors.length}개 날짜 재계산 실패`);
    }
    return results;
  }

  async recalculateWeek(employeeId: string, weekStartDate: string): Promise<void> {
    const weekEndDate = addDays(weekStartDate, 6);
    const dates = enumerateDates(weekStartDate, weekEndDate);

    const dailyRows = await this.prisma.attendanceDaily.findMany({
      where: { employeeId, workDate: { gte: dateOnly(weekStartDate), lte: dateOnly(weekEndDate) } },
    });
    const rowByDate = new Map(dailyRows.map((r) => [r.workDate.toISOString().slice(0, 10), r]));

    const dailyTotals: DailyTotal[] = dates.map((d) => ({
      date: d,
      totalWorkMinutes: rowByDate.get(d)?.actualWorkMinutes ?? 0,
    }));

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { primarySiteId: true },
    });
    const policy = await this.policyConfigResolver.resolve(employee.primarySiteId, weekStartDate);
    const isFlexible = await this.laborAgreementResolver.hasActiveFlexibleWorkAgreement(employeeId, weekStartDate);
    const paidRest = await this.computeWeeklyPaidRest(employeeId, weekStartDate, dates, rowByDate, policy);
    const calculatedAt = new Date();

    if (isFlexible) {
      const totalWorkMinutes = dailyTotals.reduce((sum, d) => sum + d.totalWorkMinutes, 0);
      const flexibleData = {
        totalWorkMinutes,
        flexibleWorkSkipped: true,
        weeklyPaidRestEligible: paidRest.eligible,
        calcVersion: CALC_ENGINE_VERSION,
        calculatedAt,
      };
      await this.prisma.attendanceWeekly.upsert({
        where: { employeeId_weekStartDate: { employeeId, weekStartDate: dateOnly(weekStartDate) } },
        create: { employeeId, weekStartDate: dateOnly(weekStartDate), ...flexibleData },
        update: flexibleData,
      });
      return;
    }

    const limitResult = checkWeeklyLimitViolation({ dailyTotals, policy });
    const overtimePayResult = calculateWeeklyOvertimePay({ dailyTotals, policy });
    const standardData = {
      totalWorkMinutes: limitResult.weeklyTotalMinutes,
      over40Minutes: limitResult.excessOver40Minutes,
      limitViolationFlag: limitResult.violated,
      weeklyBasisOvertimeMinutes: overtimePayResult.weeklyBasisOvertimeMinutes,
      totalOvertimeForPremiumMinutes: overtimePayResult.totalOvertimeForPremiumMinutes,
      weeklyPaidRestEligible: paidRest.eligible,
      flexibleWorkSkipped: false,
      calcVersion: CALC_ENGINE_VERSION,
      calculatedAt,
    };
    await this.prisma.attendanceWeekly.upsert({
      where: { employeeId_weekStartDate: { employeeId, weekStartDate: dateOnly(weekStartDate) } },
      create: { employeeId, weekStartDate: dateOnly(weekStartDate), ...standardData },
      update: standardData,
    });
  }

  async recalculateMonth(employeeId: string, yearMonth: string): Promise<void> {
    const { start, end } = monthRange(yearMonth);
    const rows = await this.prisma.attendanceDaily.findMany({
      where: { employeeId, workDate: { gte: start, lt: end } },
    });

    const totals = rows.reduce<MonthlyTotals>(
      (acc, r) => ({
        scheduledWorkMinutes: acc.scheduledWorkMinutes + r.scheduledWorkMinutes,
        actualWorkMinutes: acc.actualWorkMinutes + r.actualWorkMinutes,
        approvedOvertimeMinutes: acc.approvedOvertimeMinutes + r.approvedOvertimeMinutes,
        unapprovedOvertimeMinutes: acc.unapprovedOvertimeMinutes + r.unapprovedOvertimeMinutes,
        nightWorkMinutes: acc.nightWorkMinutes + r.nightWorkMinutes,
        holidayWorkMinutesNormal: acc.holidayWorkMinutesNormal + r.holidayWorkMinutesNormal,
        holidayWorkMinutesExcess: acc.holidayWorkMinutesExcess + r.holidayWorkMinutesExcess,
        paidLeaveMinutes: acc.paidLeaveMinutes + r.paidLeaveMinutes,
        absenceDays: acc.absenceDays + (r.isAbsence ? 1 : 0),
      }),
      { ...EMPTY_MONTHLY_TOTALS },
    );

    const data = {
      totals: totals as unknown as Prisma.InputJsonValue,
      calcVersion: CALC_ENGINE_VERSION,
      calculatedAt: new Date(),
    };
    await this.prisma.attendanceMonthly.upsert({
      where: { employeeId_yearMonth: { employeeId, yearMonth } },
      create: { employeeId, yearMonth, ...data },
      update: data,
    });
  }

  private async computeWeeklyPaidRest(
    employeeId: string,
    weekStartDate: string,
    weekDates: string[],
    dailyRowByDate: Map<string, AttendanceDaily>,
    policy: Parameters<typeof determineWeeklyPaidRest>[0]['policy'],
  ) {
    const weekEndDate = addDays(weekStartDate, 6);
    const scheduleRows = await this.prisma.schedule.findMany({
      where: { employeeId, workDate: { gte: dateOnly(weekStartDate), lte: dateOnly(weekEndDate) } },
      select: { workDate: true },
    });
    const scheduledDateSet = new Set(scheduleRows.map((s) => s.workDate.toISOString().slice(0, 10)));
    const scheduledWorkdays = weekDates
      .filter((d) => scheduledDateSet.has(d))
      .map((d) => ({ date: d, fullyAttended: dailyRowByDate.get(d) ? !dailyRowByDate.get(d)!.isAbsence : false }));

    const fourWeekAverageWeeklyScheduledMinutes = await this.computeFourWeekAverageScheduledMinutes(
      employeeId,
      weekStartDate,
    );

    return determineWeeklyPaidRest({ scheduledWorkdays, fourWeekAverageWeeklyScheduledMinutes, policy });
  }

  private async computeFourWeekAverageScheduledMinutes(employeeId: string, weekStartDate: string): Promise<number> {
    const rangeStart = addDays(weekStartDate, -21);
    const rangeEnd = addDays(weekStartDate, 6);
    const rows = await this.prisma.schedule.findMany({
      where: { employeeId, workDate: { gte: dateOnly(rangeStart), lte: dateOnly(rangeEnd) } },
      select: { plannedStartAt: true, plannedEndAt: true, plannedBreakMinutes: true },
    });
    const totalMinutes = rows.reduce((sum, s) => {
      const span = Math.floor((s.plannedEndAt.getTime() - s.plannedStartAt.getTime()) / 60000);
      return sum + Math.max(0, span - s.plannedBreakMinutes);
    }, 0);
    return Math.floor(totalMinutes / 4);
  }

  private async assertPayrollOpen(siteId: string, workDate: string): Promise<void> {
    const periodYearMonth = yearMonthOf(workDate);
    const close = await this.prisma.payrollClose.findUnique({
      where: { siteId_periodYearMonth: { siteId, periodYearMonth } },
    });
    if (close && close.status !== 'OPEN') {
      throw new PayrollPeriodClosedError(siteId, periodYearMonth);
    }
  }

  private toAttendanceDailyData(
    result: ReturnType<typeof calculateDailyAttendance>,
    inputSnapshotHash: string,
    calculatedAt: Date,
  ) {
    if (result.status === 'PENDING') {
      return {
        scheduledWorkMinutes: result.partial.scheduledWorkMinutes,
        actualWorkMinutes: 0,
        approvedOvertimeMinutes: 0,
        unapprovedOvertimeMinutes: 0,
        scheduledExcessMinutes: 0,
        nightWorkMinutes: 0,
        holidayWorkMinutesNormal: 0,
        holidayWorkMinutesExcess: 0,
        breakMinutes: 0,
        latenessMinutes: 0,
        earlyLeaveMinutes: 0,
        paidLeaveMinutes: 0,
        isAbsence: false,
        status: 'PENDING' as AttendanceDailyStatus,
        calcVersion: CALC_ENGINE_VERSION,
        calculatedAt,
        inputSnapshotHash,
        breakdown: [] as unknown as Prisma.InputJsonValue,
      };
    }

    return {
      scheduledWorkMinutes: result.scheduledWorkMinutes,
      actualWorkMinutes: result.actualWorkMinutes,
      approvedOvertimeMinutes: result.approvedOvertimeMinutes,
      unapprovedOvertimeMinutes: result.unapprovedOvertimeMinutes,
      scheduledExcessMinutes: result.scheduledExcessMinutes,
      nightWorkMinutes: result.nightWorkMinutes,
      holidayWorkMinutesNormal: result.holidayWorkMinutesNormal,
      holidayWorkMinutesExcess: result.holidayWorkMinutesExcess,
      breakMinutes: result.breakMinutes,
      latenessMinutes: result.latenessMinutes,
      earlyLeaveMinutes: result.earlyLeaveMinutes,
      paidLeaveMinutes: result.paidLeaveMinutes,
      isAbsence: result.isAbsence,
      status: this.deriveStatus(result.reviewFlags),
      calcVersion: CALC_ENGINE_VERSION,
      calculatedAt,
      inputSnapshotHash,
      breakdown: result.breakdown as unknown as Prisma.InputJsonValue,
    };
  }

  private deriveStatus(reviewFlags: ReviewFlag[]): AttendanceDailyStatus {
    if (reviewFlags.includes('UNAPPROVED_ACTUAL')) return 'UNAPPROVED_ACTUAL';
    if (reviewFlags.length > 0) return 'REVIEW_REQUIRED';
    return 'NORMAL';
  }
}
