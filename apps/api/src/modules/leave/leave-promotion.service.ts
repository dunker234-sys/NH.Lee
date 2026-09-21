import { Injectable } from '@nestjs/common';
import { computeArticle611Schedule, computeArticle612Schedule } from '@attendance/core-rules';
import { LeavePolicyResolverService } from '../../common/policy/leave-policy-resolver.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly } from '../../common/time/week.util';
import { NotificationService } from '../notifications/notification.service';
import { ApprovalLineResolverService } from '../approval/approval-line-resolver.service';

interface LeaveBalanceBasis {
  reasonCode?: string;
}

export interface PromotionRunResult {
  createdLogCount: number;
}

/**
 * §61 촉진 절차 배치 — 관리자 수동 트리거(HTTP)로만 실행한다(연차 발생
 * 배치와 같은 이유). §60①(FULL_YEAR_GRANT) 산정분은 §61① 절차,
 * §60②(MONTHLY_ACCRUAL) 산정분은 §61② WAVE_A/WAVE_B 절차를 각각 계산해
 * 창(window) 안에 들어온 잔액마다 필요한 단계의 LeavePromotionLog를
 * 만들고 즉시 통지한다(no-show-detection의 "탐지만 하고 알림 안 나감"
 * 미완성 패턴을 반복하지 않는다).
 */
@Injectable()
export class LeavePromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: LeavePolicyResolverService,
    private readonly notificationService: NotificationService,
    private readonly approvalLine: ApprovalLineResolverService,
  ) {}

  async run(scope: OrgScope, asOfDate: string, siteId?: string): Promise<PromotionRunResult> {
    assertScope(scope);
    if (siteId) assertSiteInScope(scope, siteId);
    const siteIds = siteId ? [siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        leaveType: { category: 'ANNUAL' },
        expiryDate: { gte: dateOnly(asOfDate) },
        employee: siteIds ? { siteAssignments: { some: { siteId: { in: siteIds } } } } : undefined,
      },
      include: { employee: true },
    });

    let createdLogCount = 0;
    for (const balance of balances) {
      const policy = await this.policyResolver.resolve(balance.employee.primarySiteId, dateOnly(asOfDate));
      const basis = balance.basis as LeaveBalanceBasis;
      const expiryDateStr = balance.expiryDate.toISOString().slice(0, 10);

      if (basis.reasonCode === 'FULL_YEAR_GRANT') {
        const schedule = computeArticle611Schedule({ leaveExpiryDate: expiryDateStr }, policy);
        createdLogCount += await this.maybeCreateLog(balance.id, balance.employeeId, 'ARTICLE_61_1', null, asOfDate, schedule);
      } else if (basis.reasonCode === 'MONTHLY_ACCRUAL') {
        const schedule = computeArticle612Schedule({ firstYearEndDate: expiryDateStr }, policy);
        createdLogCount += await this.maybeCreateLog(balance.id, balance.employeeId, 'ARTICLE_61_2', 'WAVE_A', asOfDate, schedule.waveA);
        createdLogCount += await this.maybeCreateLog(balance.id, balance.employeeId, 'ARTICLE_61_2', 'WAVE_B', asOfDate, schedule.waveB);
      }
    }

    return { createdLogCount };
  }

  private async maybeCreateLog(
    leaveBalanceId: string,
    employeeId: string,
    procedureType: 'ARTICLE_61_1' | 'ARTICLE_61_2',
    wave: 'WAVE_A' | 'WAVE_B' | null,
    asOfDate: string,
    schedule: { firstNoticeWindowStart: string; firstNoticeWindowEnd: string; secondNoticeDeadline: string },
  ): Promise<number> {
    const existingLogs = await this.prisma.leavePromotionLog.findMany({
      where: { leaveBalanceId, procedureType, wave },
    });
    const hasFirstNotice = existingLogs.some((l) => l.step === 'FIRST_NOTICE');
    const hasSecondNotice = existingLogs.some((l) => l.step === 'SECOND_NOTICE');
    let created = 0;

    if (!hasFirstNotice && asOfDate >= schedule.firstNoticeWindowStart && asOfDate <= schedule.firstNoticeWindowEnd) {
      await this.createLog(leaveBalanceId, employeeId, procedureType, wave, 'FIRST_NOTICE', schedule.firstNoticeWindowEnd, asOfDate);
      created += 1;
    } else if (hasFirstNotice && !hasSecondNotice && asOfDate > schedule.firstNoticeWindowEnd && asOfDate <= schedule.secondNoticeDeadline) {
      await this.createLog(leaveBalanceId, employeeId, procedureType, wave, 'SECOND_NOTICE', schedule.secondNoticeDeadline, asOfDate);
      created += 1;
    }
    return created;
  }

  private async createLog(
    leaveBalanceId: string,
    employeeId: string,
    procedureType: 'ARTICLE_61_1' | 'ARTICLE_61_2',
    wave: 'WAVE_A' | 'WAVE_B' | null,
    step: 'FIRST_NOTICE' | 'SECOND_NOTICE',
    dueDate: string,
    sentAtDate: string,
  ): Promise<void> {
    await this.prisma.leavePromotionLog.create({
      data: {
        leaveBalanceId,
        procedureType,
        wave,
        step,
        noticeDate: dateOnly(sentAtDate),
        dueDate: dateOnly(dueDate),
        method: 'ELECTRONIC_DOCUMENT',
        sentAt: new Date(`${sentAtDate}T00:00:00.000Z`),
      },
    });

    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { name: true, primarySiteId: true } });
    await this.notificationService.notify('LEAVE_PROMOTION_NOTICE_SENT', employeeId, { step, dueDate });

    const approvers = await this.approvalLine.resolveApprovers(employee.primarySiteId, dateOnly(sentAtDate));
    for (const approver of approvers) {
      await this.notificationService.notify('LEAVE_PROMOTION_NOTICE_SENT', approver.employeeId, {
        employeeName: employee.name,
        step,
        dueDate,
      });
    }
  }
}
