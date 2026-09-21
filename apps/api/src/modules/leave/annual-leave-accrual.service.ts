import { Injectable } from '@nestjs/common';
import { calculateAnnualLeaveGrant, MonthlyAttendanceRecord } from '@attendance/core-rules';
import { LeavePolicyResolverService } from '../../common/policy/leave-policy-resolver.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly } from '../../common/time/week.util';
import { LeaveDeemedAttendanceService } from './leave-deemed-attendance.service';
import { LeaveHeadcountApplicabilityService } from './leave-headcount-applicability.service';

function daysBetweenInclusive(startDate: string, endDate: string): number {
  return Math.floor((dateOnly(endDate).getTime() - dateOnly(startDate).getTime()) / 86_400_000) + 1;
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** 개월수를 더하되 말일 흘러넘침을 클램핑한다(core-rules의 date-arithmetic.ts와
 * 같은 이유 — 1/31 + 1개월이 3/3이 아니라 2/28/29이어야 한다). */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const totalMonthIndex = month + months;
  const targetYear = year + Math.floor(totalMonthIndex / 12);
  const targetMonthIndex = ((totalMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonthIndex));
  return new Date(Date.UTC(targetYear, targetMonthIndex, clampedDay)).toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface AccrualRunResult {
  processedCount: number;
  employeeIds: string[];
}

/**
 * 연차 발생 배치 — 관리자 수동 트리거(HTTP)로만 실행한다(STEP6.5의 조기출근
 * 반복 탐지와 같은 이유: 저빈도·기념일 단위 트리거라 BullMQ 자동 등록은
 * 파일럿 검증 후 후속 작업으로 미룬다).
 */
@Injectable()
export class AnnualLeaveAccrualService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: LeavePolicyResolverService,
    private readonly headcountApplicability: LeaveHeadcountApplicabilityService,
    private readonly deemedAttendance: LeaveDeemedAttendanceService,
  ) {}

  async run(scope: OrgScope, asOfDate: string, siteId?: string): Promise<AccrualRunResult> {
    assertScope(scope);
    if (siteId) assertSiteInScope(scope, siteId);
    const siteIds = siteId ? [siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    const employees = await this.prisma.employee.findMany({
      where: {
        status: { not: 'RESIGNED' },
        hireDate: { lte: dateOnly(asOfDate) },
        primarySiteId: siteIds ? { in: siteIds } : undefined,
      },
    });

    const annualLeaveType = await this.prisma.leaveType.findFirst({ where: { category: 'ANNUAL' } });
    if (!annualLeaveType) {
      throw new Error('category=ANNUAL인 LeaveType이 없습니다. 먼저 POST /admin/leave/types로 생성하세요.');
    }

    const processedEmployeeIds: string[] = [];
    for (const employee of employees) {
      const grant = await this.accrueForEmployee(employee, asOfDate, annualLeaveType.id);
      if (grant) processedEmployeeIds.push(employee.id);
    }

    return { processedCount: processedEmployeeIds.length, employeeIds: processedEmployeeIds };
  }

  private async accrueForEmployee(
    employee: { id: string; hireDate: Date; resignationDate: Date | null; primarySiteId: string; contractedWorkMinutes: number | null },
    asOfDate: string,
    leaveTypeId: string,
  ): Promise<boolean> {
    const hireDateStr = employee.hireDate.toISOString().slice(0, 10);
    const siteId = employee.primarySiteId;
    const policy = await this.policyResolver.resolve(siteId, dateOnly(asOfDate));

    const leaveApplicable = await this.headcountApplicability.isApplicable(siteId, asOfDate);
    const fourWeekAverageWeeklyScheduledMinutes = await this.computeFourWeekAverageScheduledMinutes(employee.id, asOfDate);

    const yearsOfService = this.yearsOfServiceAt(hireDateStr, asOfDate);

    if (yearsOfService < 1) {
      const firstYearEndDate = addDaysStr(addMonths(hireDateStr, 12), -1);
      const months = await this.buildMonthlyAttendanceRecords(employee.id, hireDateStr, asOfDate);
      const grant = calculateAnnualLeaveGrant(
        { leaveApplicable, fourWeekAverageWeeklyScheduledMinutes, yearsOfService, monthly: { months }, firstYearEndDate },
        policy,
      );
      await this.upsertBalance(employee.id, leaveTypeId, asOfDate, firstYearEndDate, grant);
      return true;
    }

    // periodEnd = 이번 산정연차의 "N년째 근속 완료일"(그 다음 날 15일+가산이
    // 발생한다, §60①). periodStart는 그 직전 1년의 시작일.
    const periodEnd = addDaysStr(addMonths(hireDateStr, yearsOfService * 12), -1);
    const periodStart = addMonths(hireDateStr, (yearsOfService - 1) * 12);
    const totalScheduledWorkdays = await this.prisma.schedule.count({
      where: { employeeId: employee.id, workDate: { gte: dateOnly(periodStart), lte: dateOnly(periodEnd) } },
    });
    const absentWorkdays = await this.prisma.attendanceDaily.count({
      where: { employeeId: employee.id, workDate: { gte: dateOnly(periodStart), lte: dateOnly(periodEnd) }, isAbsence: true },
    });
    const deemedAttendanceWorkdays = await this.deemedAttendance.countDeemedAttendanceDays(employee.id, periodStart, periodEnd);
    const continuesEmploymentAfterPeriod =
      employee.resignationDate == null || employee.resignationDate.toISOString().slice(0, 10) > periodEnd;

    const effectiveDate = addDaysStr(periodEnd, 1);
    const expiryDate = addDaysStr(addMonths(effectiveDate, 12), -1);
    const grant = calculateAnnualLeaveGrant(
      {
        leaveApplicable,
        fourWeekAverageWeeklyScheduledMinutes,
        yearsOfService,
        fullYear: {
          attendance: { totalScheduledWorkdays, absentWorkdays, deemedAttendanceWorkdays },
          continuesEmploymentAfterPeriod,
        },
      },
      policy,
    );
    await this.upsertBalance(employee.id, leaveTypeId, effectiveDate, expiryDate, grant);
    return true;
  }

  private async upsertBalance(
    employeeId: string,
    leaveTypeId: string,
    effectiveDate: string,
    expiryDate: string,
    grant: ReturnType<typeof calculateAnnualLeaveGrant>,
  ): Promise<void> {
    await this.prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_referencePeriod: { employeeId, leaveTypeId, referencePeriod: effectiveDate } },
      create: {
        employeeId,
        leaveTypeId,
        referencePeriod: effectiveDate,
        effectiveDate: dateOnly(effectiveDate),
        expiryDate: dateOnly(expiryDate),
        grantedDays: grant.grantedDays,
        basis: grant.basis as never,
      },
      update: {
        grantedDays: grant.grantedDays,
        basis: grant.basis as never,
      },
    });
  }

  private yearsOfServiceAt(hireDateStr: string, asOfDate: string): number {
    let years = 0;
    while (addMonths(hireDateStr, (years + 1) * 12) <= asOfDate) years += 1;
    return years;
  }

  private async computeFourWeekAverageScheduledMinutes(employeeId: string, asOfDate: string): Promise<number> {
    const rangeStart = addDaysStr(asOfDate, -27);
    const rows = await this.prisma.schedule.findMany({
      where: { employeeId, workDate: { gte: dateOnly(rangeStart), lte: dateOnly(asOfDate) } },
      select: { plannedStartAt: true, plannedEndAt: true, plannedBreakMinutes: true },
    });
    const totalMinutes = rows.reduce((sum, s) => {
      const span = Math.floor((s.plannedEndAt.getTime() - s.plannedStartAt.getTime()) / 60000);
      return sum + Math.max(0, span - s.plannedBreakMinutes);
    }, 0);
    return Math.floor(totalMinutes / 4);
  }

  private async buildMonthlyAttendanceRecords(employeeId: string, hireDateStr: string, asOfDate: string): Promise<MonthlyAttendanceRecord[]> {
    const months: MonthlyAttendanceRecord[] = [];
    for (let i = 0; addMonths(hireDateStr, i + 1) <= asOfDate; i += 1) {
      const monthStartDate = addMonths(hireDateStr, i);
      const monthEndDate = addDaysStr(addMonths(hireDateStr, i + 1), -1);

      const scheduledCount = await this.prisma.schedule.count({
        where: { employeeId, workDate: { gte: dateOnly(monthStartDate), lte: dateOnly(monthEndDate) } },
      });
      const absentCount = await this.prisma.attendanceDaily.count({
        where: { employeeId, workDate: { gte: dateOnly(monthStartDate), lte: dateOnly(monthEndDate) }, isAbsence: true },
      });
      const deemedDays = await this.deemedAttendance.countDeemedAttendanceDays(employeeId, monthStartDate, monthEndDate);

      months.push({ monthStartDate, fullyAttended: scheduledCount > 0 && Math.max(0, absentCount - deemedDays) === 0 });
    }
    return months;
  }
}
