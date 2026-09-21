import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { checkConsecutiveWorkdayLimit } from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollValidationPolicyResolverService } from '../../common/policy/payroll-validation-policy-resolver.service';
import { monthRange } from '../../common/time/week.util';
import { PayrollCloseValidationRequiredError } from './errors/payroll-close-errors';

/**
 * 마감 전 자동 검증(요구사항서 4.8⑥) — 월 근로시간 이상치, 연장 과다, 휴게 미부여,
 * 연속근무일 초과. CONSECUTIVE_WORKDAY_EXCEEDED/EXCESSIVE_OVERTIME은 법정 상한
 * 초과 가능성을 내포해 BLOCKING(확인만으로는 넘어갈 수 없음), 나머지 둘은
 * WARNING(확인은 필요하되 차단하지 않음)으로 분류한다.
 *
 * BREAK_NOT_GRANTED는 attendance_daily.status==='REVIEW_REQUIRED'를 근거로 쓴다 —
 * STEP3.5의 reviewFlags(BREAK_NOT_GRANTED/BREAK_UNDER_PROVIDED/BREAK_IN_MISSING 등)는
 * status로 collapse된 뒤 원본 플래그별로 재구분 가능한 컬럼이 없다(RULES.md 갭과
 * 같은 종류의 기존 한계) — 그래서 이 규칙은 "휴게 관련을 포함해 검토가 필요한
 * 날이 있다"는 근사치를 보고한다.
 */
@Injectable()
export class PayrollCloseValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: PayrollValidationPolicyResolverService,
  ) {}

  async runValidation(siteId: string, periodYearMonth: string, generatedBy: string | null): Promise<{ reportId: string; findingCount: number; blockingCount: number }> {
    const { start, end } = monthRange(periodYearMonth);
    const policy = await this.policyResolver.resolve(siteId, end);

    const rows = await this.prisma.attendanceDaily.findMany({
      where: { siteId, workDate: { gte: start, lt: end } },
      select: {
        employeeId: true,
        workDate: true,
        actualWorkMinutes: true,
        approvedOvertimeMinutes: true,
        unapprovedOvertimeMinutes: true,
        status: true,
      },
    });

    const byEmployee = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byEmployee.get(row.employeeId);
      if (list) list.push(row);
      else byEmployee.set(row.employeeId, [row]);
    }

    const findings: {
      employeeId: string | null;
      ruleCode: 'MONTHLY_HOURS_OUTLIER' | 'EXCESSIVE_OVERTIME' | 'BREAK_NOT_GRANTED' | 'CONSECUTIVE_WORKDAY_EXCEEDED';
      severity: 'INFO' | 'WARNING' | 'BLOCKING';
      message: string;
      detail: Record<string, unknown>;
    }[] = [];

    for (const [employeeId, days] of byEmployee) {
      const totalActualMinutes = days.reduce((sum, d) => sum + d.actualWorkMinutes, 0);
      if (totalActualMinutes > policy.monthlyHoursOutlierThresholdMinutes) {
        findings.push({
          employeeId,
          ruleCode: 'MONTHLY_HOURS_OUTLIER',
          severity: 'WARNING',
          message: `월 실근로시간(${totalActualMinutes}분)이 이상치 임계값(${policy.monthlyHoursOutlierThresholdMinutes}분)을 초과했습니다.`,
          detail: { totalActualMinutes },
        });
      }

      const totalOvertimeMinutes = days.reduce((sum, d) => sum + d.approvedOvertimeMinutes + d.unapprovedOvertimeMinutes, 0);
      if (totalOvertimeMinutes > policy.excessiveOvertimeThresholdMinutes) {
        findings.push({
          employeeId,
          ruleCode: 'EXCESSIVE_OVERTIME',
          severity: 'BLOCKING',
          message: `월 연장근로시간(승인+미승인, ${totalOvertimeMinutes}분)이 과다 임계값(${policy.excessiveOvertimeThresholdMinutes}분)을 초과했습니다.`,
          detail: { totalOvertimeMinutes },
        });
      }

      if (days.some((d) => d.status === 'REVIEW_REQUIRED')) {
        findings.push({
          employeeId,
          ruleCode: 'BREAK_NOT_GRANTED',
          severity: 'WARNING',
          message: '휴게 미부여 등 검토가 필요한 근태 기록이 있습니다.',
          detail: { reviewRequiredDates: days.filter((d) => d.status === 'REVIEW_REQUIRED').map((d) => d.workDate.toISOString().slice(0, 10)) },
        });
      }

      const workedDates = days.filter((d) => d.actualWorkMinutes > 0).map((d) => d.workDate.toISOString().slice(0, 10)).sort();
      const consecutive = checkConsecutiveWorkdayLimit({ workDates: workedDates, maxConsecutiveDays: policy.consecutiveWorkdayLimitDays });
      if (consecutive.violated) {
        findings.push({
          employeeId,
          ruleCode: 'CONSECUTIVE_WORKDAY_EXCEEDED',
          severity: 'BLOCKING',
          message: consecutive.reasons.join(' '),
          detail: { runs: consecutive.runs },
        });
      }
    }

    const blockingCount = findings.filter((f) => f.severity === 'BLOCKING').length;
    const report = await this.prisma.payrollCloseValidationReport.create({
      data: {
        siteId,
        periodYearMonth,
        generatedBy: generatedBy ?? undefined,
        findingCount: findings.length,
        blockingCount,
        findings: { create: findings as unknown as Prisma.PayrollCloseValidationFindingUncheckedCreateWithoutReportInput[] },
      },
    });

    await this.prisma.payrollClose.updateMany({
      where: { siteId, periodYearMonth },
      data: { lastValidationReportId: report.id },
    });

    return { reportId: report.id, findingCount: findings.length, blockingCount };
  }

  async acknowledge(reportId: string, actorEmployeeId: string): Promise<void> {
    const report = await this.prisma.payrollCloseValidationReport.findUniqueOrThrow({ where: { id: reportId } });
    if (report.blockingCount > 0) {
      throw new PayrollCloseValidationRequiredError(`차단 항목(${report.blockingCount}건)이 남아 있어 확인 처리할 수 없습니다.`);
    }
    await this.prisma.payrollCloseValidationReport.update({
      where: { id: reportId },
      data: { acknowledgedAt: new Date(), acknowledgedBy: actorEmployeeId },
    });
  }
}
