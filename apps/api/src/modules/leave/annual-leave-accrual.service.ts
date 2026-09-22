import { BadRequestException, Injectable } from '@nestjs/common';
import { calculateAnnualLeaveGrant, calculateFiscalYearFirstYearProrationDays, MonthlyAttendanceRecord } from '@attendance/core-rules';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { LeaveAccrualBasisResolverService } from '../../common/policy/leave-accrual-basis-resolver.service';
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

export interface FiscalYearMigrationResult {
  processedCount: number;
  employeeIds: string[];
}

/** 회계연도(당해년 1/1~12/31) 구간 — fiscalYear는 effectiveDate가 속하는 연도다.
 * 산정 근거(periodStart~periodEnd)는 그 직전 연도 1/1~12/31이다. */
function fiscalYearWindow(asOfDate: string): { fiscalYear: number; periodStart: string; periodEnd: string; effectiveDate: string; expiryDate: string } {
  const fiscalYear = Number(asOfDate.slice(0, 4));
  return {
    fiscalYear,
    periodStart: `${fiscalYear - 1}-01-01`,
    periodEnd: `${fiscalYear - 1}-12-31`,
    effectiveDate: `${fiscalYear}-01-01`,
    expiryDate: `${fiscalYear}-12-31`,
  };
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
    private readonly accrualBasisResolver: LeaveAccrualBasisResolverService,
    private readonly auditLog: AuditLogService,
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

  /**
   * 연차 회계연도 전환 소급 재계산(수정사항). 이미 입사일 기준으로 발생돼 있던
   * LeaveBalance 행을 회계연도 기준 재계산값으로 **덮어쓴다**(사용자 확정 방침) —
   * 단, 이미 사용된 usedDays/carriedOverDays/expiredDays는 겹치는 기존 행에서
   * 합산해 그대로 이월한다. 상태변경이라 audit_log에 남긴다(절대규칙 — 감사
   * 로그는 상태변경 이벤트). 매번 겹침 조회부터 다시 하므로 재실행해도 안전하다.
   */
  async migrateToFiscalYearBasis(
    scope: OrgScope,
    siteId: string,
    asOfDate: string,
    actorPrincipal: string,
    actorRole: string,
  ): Promise<FiscalYearMigrationResult> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);

    const basis = await this.accrualBasisResolver.resolve(siteId, dateOnly(asOfDate));
    if (basis !== 'FISCAL_YEAR') {
      throw new BadRequestException({
        code: 'ANNUAL_LEAVE_BASIS_NOT_FISCAL_YEAR',
        message: 'annualLeaveAccrualBasis 정책이 FISCAL_YEAR가 아닙니다. 먼저 정책을 전환하세요.',
      });
    }

    const annualLeaveType = await this.prisma.leaveType.findFirst({ where: { category: 'ANNUAL' } });
    if (!annualLeaveType) {
      throw new Error('category=ANNUAL인 LeaveType이 없습니다. 먼저 POST /admin/leave/types로 생성하세요.');
    }

    const employees = await this.prisma.employee.findMany({
      where: { status: { not: 'RESIGNED' }, hireDate: { lte: dateOnly(asOfDate) }, primarySiteId: siteId },
    });

    const { fiscalYear, periodStart, periodEnd, effectiveDate, expiryDate } = fiscalYearWindow(asOfDate);

    const processedEmployeeIds: string[] = [];
    for (const employee of employees) {
      const hireDateStr = employee.hireDate.toISOString().slice(0, 10);
      const yearsOfService = this.yearsOfServiceAt(hireDateStr, asOfDate);
      if (yearsOfService < 1) continue; // 1년 미만 개근월 가산은 기준과 무관 — 대상 아님(위 accrueForEmployee 주석 참고)

      const policy = await this.policyResolver.resolve(siteId, dateOnly(asOfDate));
      const leaveApplicable = await this.headcountApplicability.isApplicable(siteId, asOfDate);
      const fourWeekAverageWeeklyScheduledMinutes = await this.computeFourWeekAverageScheduledMinutes(employee.id, asOfDate);
      const grant = await this.computeFiscalYearGrant(
        employee,
        hireDateStr,
        periodStart,
        periodEnd,
        yearsOfService,
        leaveApplicable,
        fourWeekAverageWeeklyScheduledMinutes,
        policy,
      );

      // 이 회계연도 구간과 겹치는 기존 행(입사일 기준으로 이미 발생된 행 포함)을 찾는다.
      const overlapping = await this.prisma.leaveBalance.findMany({
        where: {
          employeeId: employee.id,
          leaveTypeId: annualLeaveType.id,
          effectiveDate: { lte: dateOnly(expiryDate) },
          expiryDate: { gte: dateOnly(effectiveDate) },
        },
      });
      const usedDaysSum = overlapping.reduce((sum, b) => sum + b.usedDays.toNumber(), 0);
      const carriedOverDaysSum = overlapping.reduce((sum, b) => sum + b.carriedOverDays.toNumber(), 0);
      const expiredDaysSum = overlapping.reduce((sum, b) => sum + b.expiredDays.toNumber(), 0);
      const beforeSnapshot = overlapping.map((b) => ({
        id: b.id,
        referencePeriod: b.referencePeriod,
        grantedDays: b.grantedDays.toNumber(),
        usedDays: b.usedDays.toNumber(),
      }));

      const referencePeriod = String(fiscalYear);
      const newBasis = { migratedFromAnniversary: true, migratedAt: new Date().toISOString(), previousRows: beforeSnapshot, grantBasis: grant.basis };

      await this.prisma.$transaction(async (tx) => {
        const staleIds = overlapping.filter((b) => b.referencePeriod !== referencePeriod).map((b) => b.id);
        if (staleIds.length > 0) {
          await tx.leaveBalance.deleteMany({ where: { id: { in: staleIds } } });
        }
        await tx.leaveBalance.upsert({
          where: { employeeId_leaveTypeId_referencePeriod: { employeeId: employee.id, leaveTypeId: annualLeaveType.id, referencePeriod } },
          create: {
            employeeId: employee.id,
            leaveTypeId: annualLeaveType.id,
            referencePeriod,
            effectiveDate: dateOnly(effectiveDate),
            expiryDate: dateOnly(expiryDate),
            grantedDays: grant.grantedDays,
            usedDays: usedDaysSum,
            carriedOverDays: carriedOverDaysSum,
            expiredDays: expiredDaysSum,
            basis: newBasis as never,
          },
          update: {
            grantedDays: grant.grantedDays,
            usedDays: usedDaysSum,
            carriedOverDays: carriedOverDaysSum,
            expiredDays: expiredDaysSum,
            basis: newBasis as never,
          },
        });
      });

      await this.auditLog.write({
        actorPrincipal,
        actorRole,
        eventType: 'ANNUAL_LEAVE_BASIS_MIGRATED',
        resourceType: 'leave_balance',
        resourceId: employee.id,
        subjectEmployeeId: employee.id,
        beforeValue: beforeSnapshot,
        afterValue: { referencePeriod, grantedDays: grant.grantedDays, usedDays: usedDaysSum },
        reason: `연차 회계연도 전환 소급 재계산(기준일 ${asOfDate})`,
      });

      processedEmployeeIds.push(employee.id);
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

    // §60② 개근월 가산(위 <1년 분기)은 기준과 무관하게 항상 입사일 기준이다 —
    // 회계연도 전환은 1년 이상 근속자의 연간(§60①) 그랜트에만 적용한다.
    const basis = await this.accrualBasisResolver.resolve(siteId, dateOnly(asOfDate));
    if (basis === 'FISCAL_YEAR') {
      const { fiscalYear, periodStart, periodEnd, effectiveDate, expiryDate } = fiscalYearWindow(asOfDate);
      const grant = await this.computeFiscalYearGrant(employee, hireDateStr, periodStart, periodEnd, yearsOfService, leaveApplicable, fourWeekAverageWeeklyScheduledMinutes, policy);
      await this.upsertBalance(employee.id, leaveTypeId, effectiveDate, expiryDate, grant, String(fiscalYear));
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
    grant: { grantedDays: number; basis: unknown },
    referencePeriod: string = effectiveDate,
  ): Promise<void> {
    await this.prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_referencePeriod: { employeeId, leaveTypeId, referencePeriod } },
      create: {
        employeeId,
        leaveTypeId,
        referencePeriod,
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

  /**
   * 회계연도 기준 그랜트(수정사항: 연차 배치 관리 회계연도 전환). 입사 첫 회계연도라
   * periodStart~periodEnd 전체를 채우지 못했으면 fiscal-year-proration.ts로 비례
   * 발생시키고, 아니면 기존 calculateAnnualLeaveGrant()를 그대로 쓴다(기간만
   * 회계연도로 바뀔 뿐 계산 로직 자체는 동일).
   */
  private async computeFiscalYearGrant(
    employee: { id: string; resignationDate: Date | null },
    hireDateStr: string,
    periodStart: string,
    periodEnd: string,
    yearsOfService: number,
    leaveApplicable: boolean,
    fourWeekAverageWeeklyScheduledMinutes: number,
    policy: Parameters<typeof calculateAnnualLeaveGrant>[1],
  ): Promise<{ grantedDays: number; basis: unknown }> {
    if (hireDateStr > periodStart) {
      const proratedDays = calculateFiscalYearFirstYearProrationDays(
        { hireDate: hireDateStr, fiscalYearStartDate: periodStart, fiscalYearEndDate: periodEnd },
        policy,
      );
      return {
        grantedDays: proratedDays,
        basis: { type: 'FISCAL_YEAR_FIRST_YEAR_PRORATION', hireDate: hireDateStr, fiscalYearStartDate: periodStart, fiscalYearEndDate: periodEnd },
      };
    }

    const totalScheduledWorkdays = await this.prisma.schedule.count({
      where: { employeeId: employee.id, workDate: { gte: dateOnly(periodStart), lte: dateOnly(periodEnd) } },
    });
    const absentWorkdays = await this.prisma.attendanceDaily.count({
      where: { employeeId: employee.id, workDate: { gte: dateOnly(periodStart), lte: dateOnly(periodEnd) }, isAbsence: true },
    });
    const deemedAttendanceWorkdays = await this.deemedAttendance.countDeemedAttendanceDays(employee.id, periodStart, periodEnd);
    const continuesEmploymentAfterPeriod =
      employee.resignationDate == null || employee.resignationDate.toISOString().slice(0, 10) > periodEnd;

    return calculateAnnualLeaveGrant(
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
