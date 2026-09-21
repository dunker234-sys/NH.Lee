import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  calculateOrdinaryHourlyWage,
  calculatePayrollAmounts,
  calculateWeeklyPaidRestMinutes,
  PayrollStatementLeaveDay,
  PayrollStatementSourceDay,
  PayrollStatementWeek,
  selectPayrollLayoutType,
  synthesizePayrollStatement,
} from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollPolicyResolverService } from '../../common/policy/payroll-policy-resolver.service';
import { canonicalJson, sha256 } from '../../common/crypto/hash.util';
import { addDays, mondayOfWeek, monthRange } from '../../common/time/week.util';

export interface ComputedPayrollStatementLine {
  employeeId: string;
  layoutType: 'MONTHLY' | 'DAILY';
  workDate?: string;
  scheduledWorkMinutes: number;
  approvedOvertimeMinutes: number;
  unapprovedOvertimeMinutes: number;
  nightWorkMinutes: number;
  holidayWorkMinutesNormal: number;
  holidayWorkMinutesExcess: number;
  absenceDays: number;
  latenessDays: number;
  earlyLeaveDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  weeklyPaidRestEligibleCount: number;
  weeklyPaidRestMinutes: number;
  ordinaryHourlyWageAmount: number;
  basePayAmount: number;
  overtimePayAmount: number;
  nightPayAmount: number;
  holidayPayAmount: number;
  weeklyPaidRestPayAmount: number;
  totalPayAmount: number;
  breakdown: unknown[];
  inputSnapshotHash: string;
}

/**
 * 임금대장/임금명세서 항목 합성 오케스트레이션. core-rules(순수 함수)는 이미
 * 계산된 값만 집계·환산하고, 이 서비스가 DB에서 그 입력을 모아 주입한다.
 * dry-run(미리보기)과 실제 저장이 같은 compute()를 공유한다 — hr-sync.service.ts의
 * "dry-run/run이 갈라지면 안 된다"는 교훈을 그대로 따른다.
 */
@Injectable()
export class PayrollStatementComputationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: PayrollPolicyResolverService,
  ) {}

  async compute(siteId: string, periodYearMonth: string): Promise<ComputedPayrollStatementLine[]> {
    const { start, end } = monthRange(periodYearMonth);
    const paddedStart = addDays(start.toISOString().slice(0, 10), -6);
    const paddedEnd = addDays(end.toISOString().slice(0, 10), 6);
    const paddedStartDate = new Date(`${paddedStart}T00:00:00.000Z`);
    const paddedEndDate = new Date(`${paddedEnd}T00:00:00.000Z`);

    const [dailyRows, employees] = await Promise.all([
      this.prisma.attendanceDaily.findMany({
        where: { siteId, workDate: { gte: paddedStartDate, lt: paddedEndDate } },
        select: {
          employeeId: true,
          workDate: true,
          scheduledWorkMinutes: true,
          approvedOvertimeMinutes: true,
          unapprovedOvertimeMinutes: true,
          nightWorkMinutes: true,
          holidayWorkMinutesNormal: true,
          holidayWorkMinutesExcess: true,
          latenessMinutes: true,
          earlyLeaveMinutes: true,
          isAbsence: true,
        },
      }),
      this.prisma.employee.findMany({
        where: { primarySiteId: siteId, attendanceDaily: { some: { siteId, workDate: { gte: start, lt: end } } } },
        select: { id: true, employmentType: true },
      }),
    ]);

    if (employees.length === 0) return [];

    const employeeIds = employees.map((e) => e.id);
    const weekStartDates = [...new Set(dailyRows.map((r) => mondayOfWeek(r.workDate.toISOString().slice(0, 10))))];

    const [leaveRequests, weeklyRows, wageRates, policy] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          startDate: { lt: end },
          endDate: { gte: start },
        },
        select: { employeeId: true, startDate: true, deductedDays: true, leaveType: { select: { paid: true } } },
      }),
      this.prisma.attendanceWeekly.findMany({
        where: { employeeId: { in: employeeIds }, weekStartDate: { in: weekStartDates.map((d) => new Date(`${d}T00:00:00.000Z`)) } },
        select: { employeeId: true, weekStartDate: true, weeklyPaidRestEligible: true },
      }),
      this.prisma.employeeWageRate.findMany({
        where: { employeeId: { in: employeeIds }, effectiveStartDate: { lte: end } },
        orderBy: { effectiveStartDate: 'desc' },
      }),
      this.policyResolver.resolve(siteId, end),
    ]);

    const daysByEmployee = groupBy(dailyRows, (r) => r.employeeId);
    const leavesByEmployee = groupBy(leaveRequests, (r) => r.employeeId);
    const weeklyByEmployee = groupBy(weeklyRows, (r) => r.employeeId);
    const wageRateByEmployee = new Map<string, (typeof wageRates)[number]>();
    for (const wr of wageRates) {
      if (!wageRateByEmployee.has(wr.employeeId)) wageRateByEmployee.set(wr.employeeId, wr);
    }

    const results: ComputedPayrollStatementLine[] = [];
    for (const employee of employees) {
      const allDays = daysByEmployee.get(employee.id) ?? [];
      const monthDays = allDays.filter((d) => d.workDate >= start && d.workDate < end);
      const layoutType = selectPayrollLayoutType(employee.employmentType);

      const sourceDays: PayrollStatementSourceDay[] = monthDays.map((d) => ({
        workDate: d.workDate.toISOString().slice(0, 10),
        scheduledWorkMinutes: d.scheduledWorkMinutes,
        approvedOvertimeMinutes: d.approvedOvertimeMinutes,
        unapprovedOvertimeMinutes: d.unapprovedOvertimeMinutes,
        nightWorkMinutes: d.nightWorkMinutes,
        holidayWorkMinutesNormal: d.holidayWorkMinutesNormal,
        holidayWorkMinutesExcess: d.holidayWorkMinutesExcess,
        latenessMinutes: d.latenessMinutes,
        earlyLeaveMinutes: d.earlyLeaveMinutes,
        isAbsence: d.isAbsence,
      }));

      // 다일(多日) 휴가 신청은 시작일에 전액 귀속하는 근사치를 쓴다 — 일자별
      // 분할이 필요한 경우는 향후 정교화 대상(월 합산 자체는 정확하다).
      const leaveDays: PayrollStatementLeaveDay[] = (leavesByEmployee.get(employee.id) ?? []).map((l) => ({
        date: l.startDate.toISOString().slice(0, 10),
        paid: l.leaveType.paid,
        deductedDays: Number(l.deductedDays),
      }));

      const weekBuckets = groupBy(allDays, (d) => mondayOfWeek(d.workDate.toISOString().slice(0, 10)));
      const weeklyEligibleByWeek = new Map(
        (weeklyByEmployee.get(employee.id) ?? []).map((w) => [w.weekStartDate.toISOString().slice(0, 10), w.weeklyPaidRestEligible ?? false]),
      );
      const weeklyPaidRest: PayrollStatementWeek[] = [...weekBuckets.entries()]
        .filter(([weekStartDate]) => weeklyEligibleByWeek.has(weekStartDate))
        .map(([weekStartDate, days]) => {
          const eligible = weeklyEligibleByWeek.get(weekStartDate) ?? false;
          const weeklyScheduledMinutes = days.reduce((sum, d) => sum + d.scheduledWorkMinutes, 0);
          const scheduledWorkdayCount = days.filter((d) => d.scheduledWorkMinutes > 0).length;
          const { minutes } = calculateWeeklyPaidRestMinutes({ eligible, weeklyScheduledMinutes, scheduledWorkdayCount });
          return { weekStartDate, eligible, minutes };
        });

      const synthesis = synthesizePayrollStatement({ days: sourceDays, leaveDays, weeklyPaidRest, layoutType });
      const wageRate = wageRateByEmployee.get(employee.id);
      const ordinaryHourlyWageAmount = wageRate
        ? calculateOrdinaryHourlyWage({
            wageRate: { wageType: wageRate.wageType, baseAmount: Number(wageRate.baseAmount) },
            policy: { monthlyOrdinaryWageDivisorMinutes: policy.monthlyOrdinaryWageDivisorMinutes },
          })
        : 0;

      for (const line of synthesis.lines) {
        const amounts = wageRate
          ? calculatePayrollAmounts({
              wageRate: { wageType: wageRate.wageType, baseAmount: Number(wageRate.baseAmount) },
              ordinaryHourlyWageAmount,
              statementLine: line,
              policy,
            })
          : {
              basePayAmount: 0,
              overtimePayAmount: 0,
              nightPayAmount: 0,
              holidayPayAmount: 0,
              weeklyPaidRestPayAmount: 0,
              totalPayAmount: 0,
              breakdown: [] as unknown[],
            };

        const inputSnapshotHash = sha256(canonicalJson({ line, wageRate, policy }));
        results.push({
          employeeId: employee.id,
          layoutType,
          workDate: line.workDate,
          ...line,
          ordinaryHourlyWageAmount,
          ...amounts,
          breakdown: [...synthesis.breakdown, { type: 'WAGE_BREAKDOWN', source: amounts.breakdown }],
          inputSnapshotHash,
        });
      }
    }

    return results;
  }

  private toRowKey(line: ComputedPayrollStatementLine): string {
    return `${line.employeeId}:${line.workDate ?? ''}`;
  }

  /** 대조 대상 필드(before/after 비교 시 changedFields에 쓸 이름 목록). */
  private diffFields(before: ComputedPayrollStatementLine, after: ComputedPayrollStatementLine): string[] {
    const keys: (keyof ComputedPayrollStatementLine)[] = [
      'scheduledWorkMinutes',
      'approvedOvertimeMinutes',
      'unapprovedOvertimeMinutes',
      'nightWorkMinutes',
      'holidayWorkMinutesNormal',
      'holidayWorkMinutesExcess',
      'absenceDays',
      'latenessDays',
      'earlyLeaveDays',
      'paidLeaveDays',
      'unpaidLeaveDays',
      'weeklyPaidRestEligibleCount',
      'weeklyPaidRestMinutes',
      'ordinaryHourlyWageAmount',
      'basePayAmount',
      'overtimePayAmount',
      'nightPayAmount',
      'holidayPayAmount',
      'weeklyPaidRestPayAmount',
      'totalPayAmount',
    ];
    return keys.filter((k) => before[k] !== after[k]);
  }

  /**
   * PayrollStatementItem을 upsert하고, batchType===RECLOSE면 이전 스냅샷과 비교해
   * PayrollCloseBatch/Row 차분 리포트를 남긴다. INITIAL_CLOSE는 전원 ADDED로 남긴다.
   */
  async persist(
    payrollCloseId: string,
    siteId: string,
    periodYearMonth: string,
    lines: ComputedPayrollStatementLine[],
    triggeredBy: string,
    batchType: 'INITIAL_CLOSE' | 'RECLOSE',
    version: number,
  ): Promise<{ changedEmployeeCount: number; changedItemCount: number }> {
    const previous =
      batchType === 'RECLOSE'
        ? await this.prisma.payrollStatementItem.findMany({ where: { payrollCloseId } })
        : [];
    // Decimal 컬럼(absenceDays 등)을 일반 number로 정규화한다 — 그대로 두면
    // Decimal 인스턴스 vs number 비교가 되어 값이 같아도 항상 "변경됨"으로
    // 오판정한다.
    const normalized = previous.map((p) => ({
      ...p,
      workDateStr: p.workDate ? p.workDate.toISOString().slice(0, 10) : undefined,
      absenceDays: Number(p.absenceDays),
      paidLeaveDays: Number(p.paidLeaveDays),
      unpaidLeaveDays: Number(p.unpaidLeaveDays),
      ordinaryHourlyWageAmount: Number(p.ordinaryHourlyWageAmount),
      basePayAmount: Number(p.basePayAmount),
      overtimePayAmount: Number(p.overtimePayAmount),
      nightPayAmount: Number(p.nightPayAmount),
      holidayPayAmount: Number(p.holidayPayAmount),
      weeklyPaidRestPayAmount: Number(p.weeklyPaidRestPayAmount),
      totalPayAmount: Number(p.totalPayAmount),
    }));
    const previousByKey = new Map(normalized.map((p) => [`${p.employeeId}:${p.workDateStr ?? ''}`, p]));

    const batchRows: {
      employeeId: string;
      changeType: 'ADDED' | 'REMOVED' | 'CHANGED';
      beforeValue: Prisma.InputJsonValue | null;
      afterValue: Prisma.InputJsonValue;
      changedFields: string[];
    }[] = [];

    for (const line of lines) {
      const key = this.toRowKey(line);
      const workDate = line.workDate ? new Date(`${line.workDate}T00:00:00.000Z`) : null;

      // workDate가 NULL(MONTHLY 레이아웃)이면 복합 유니크 키(payrollCloseId_employeeId_workDate)로
      // upsert()를 쓸 수 없다 — Prisma는 NULL을 포함한 compound unique where를
      // 지원하지 않는다(SQL NULL 동등비교 문제). find→create/update로 대체한다.
      const fieldValues = {
        scheduledWorkMinutes: line.scheduledWorkMinutes,
        approvedOvertimeMinutes: line.approvedOvertimeMinutes,
        unapprovedOvertimeMinutes: line.unapprovedOvertimeMinutes,
        nightWorkMinutes: line.nightWorkMinutes,
        holidayWorkMinutesNormal: line.holidayWorkMinutesNormal,
        holidayWorkMinutesExcess: line.holidayWorkMinutesExcess,
        absenceDays: line.absenceDays,
        latenessDays: line.latenessDays,
        earlyLeaveDays: line.earlyLeaveDays,
        paidLeaveDays: line.paidLeaveDays,
        unpaidLeaveDays: line.unpaidLeaveDays,
        weeklyPaidRestEligibleCount: line.weeklyPaidRestEligibleCount,
        weeklyPaidRestMinutes: line.weeklyPaidRestMinutes,
        ordinaryHourlyWageAmount: line.ordinaryHourlyWageAmount,
        basePayAmount: line.basePayAmount,
        overtimePayAmount: line.overtimePayAmount,
        nightPayAmount: line.nightPayAmount,
        holidayPayAmount: line.holidayPayAmount,
        weeklyPaidRestPayAmount: line.weeklyPaidRestPayAmount,
        totalPayAmount: line.totalPayAmount,
        breakdown: line.breakdown as unknown as Prisma.InputJsonValue,
        inputSnapshotHash: line.inputSnapshotHash,
        calcVersion: version,
      };

      const existingRow = await this.prisma.payrollStatementItem.findFirst({
        where: { payrollCloseId, employeeId: line.employeeId, workDate },
        select: { id: true },
      });
      if (existingRow) {
        await this.prisma.payrollStatementItem.update({ where: { id: existingRow.id }, data: fieldValues });
      } else {
        await this.prisma.payrollStatementItem.create({
          data: { payrollCloseId, employeeId: line.employeeId, siteId, periodYearMonth, layoutType: line.layoutType, workDate, ...fieldValues },
        });
      }

      const before = previousByKey.get(key);
      if (batchType === 'INITIAL_CLOSE') {
        batchRows.push({ employeeId: line.employeeId, changeType: 'ADDED', beforeValue: null, afterValue: line as unknown as Prisma.InputJsonValue, changedFields: [] });
      } else if (!before) {
        batchRows.push({ employeeId: line.employeeId, changeType: 'ADDED', beforeValue: null, afterValue: line as unknown as Prisma.InputJsonValue, changedFields: [] });
      } else {
        const changedFields = this.diffFields(before as unknown as ComputedPayrollStatementLine, line);
        if (changedFields.length > 0) {
          batchRows.push({
            employeeId: line.employeeId,
            changeType: 'CHANGED',
            beforeValue: before as unknown as Prisma.InputJsonValue,
            afterValue: line as unknown as Prisma.InputJsonValue,
            changedFields,
          });
        }
      }
      previousByKey.delete(key);
    }

    // 재마감 후 더 이상 산출되지 않는(범위에서 빠진) 이전 행 — REMOVED로 남긴다.
    for (const [, removed] of previousByKey) {
      batchRows.push({
        employeeId: removed.employeeId,
        changeType: 'REMOVED',
        beforeValue: removed as unknown as Prisma.InputJsonValue,
        afterValue: undefined as unknown as Prisma.InputJsonValue,
        changedFields: [],
      });
    }

    if (batchRows.length > 0) {
      await this.prisma.payrollCloseBatch.create({
        data: {
          payrollCloseId,
          siteId,
          periodYearMonth,
          version,
          batchType,
          triggeredBy,
          changedEmployeeCount: new Set(batchRows.map((r) => r.employeeId)).size,
          changedItemCount: batchRows.length,
          rows: { create: batchRows as unknown as Prisma.PayrollCloseBatchRowUncheckedCreateWithoutBatchInput[] },
        },
      });
    }

    return {
      changedEmployeeCount: new Set(batchRows.map((r) => r.employeeId)).size,
      changedItemCount: batchRows.length,
    };
  }
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}
