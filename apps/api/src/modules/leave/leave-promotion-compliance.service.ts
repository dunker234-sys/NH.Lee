import { Injectable } from '@nestjs/common';
import { LeavePromotionLog } from '@prisma/client';
import { determineArticle611Compliance, determineArticle612Compliance } from '@attendance/core-rules';
import { LeavePolicyResolverService } from '../../common/policy/leave-policy-resolver.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeaveBalanceNotFoundError } from './errors/leave-errors';

interface LeaveBalanceBasis {
  reasonCode?: string;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function noticeOf(log: LeavePromotionLog | undefined): { sentAt: string; method: 'WRITTEN_PAPER' | 'ELECTRONIC_DOCUMENT' } | null {
  if (!log || !log.sentAt) return null;
  return { sentAt: toDateString(log.sentAt), method: log.method };
}

/**
 * §61 절차 준수 판정 — 요구사항서4.3 §5 완료조건4 직접 증명 경로. 로그
 * 행이 없는 단계는 그대로 null로 core-rules에 넘긴다 — "보상의무 있음"
 * 기본값이 여기서 자연히 발동한다(추가 분기를 두지 않는다).
 */
@Injectable()
export class LeavePromotionComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: LeavePolicyResolverService,
  ) {}

  async check(leaveBalanceId: string) {
    const balance = await this.prisma.leaveBalance.findUnique({
      where: { id: leaveBalanceId },
      include: { employee: true, promotionLogs: true },
    });
    if (!balance) throw new LeaveBalanceNotFoundError(leaveBalanceId);

    const policy = await this.policyResolver.resolve(balance.employee.primarySiteId, balance.expiryDate);
    const basis = balance.basis as LeaveBalanceBasis;
    const expiryDateStr = toDateString(balance.expiryDate);

    if (basis.reasonCode === 'MONTHLY_ACCRUAL') {
      const waveALogs = balance.promotionLogs.filter((l) => l.procedureType === 'ARTICLE_61_2' && l.wave === 'WAVE_A');
      const waveBLogs = balance.promotionLogs.filter((l) => l.procedureType === 'ARTICLE_61_2' && l.wave === 'WAVE_B');

      return determineArticle612Compliance(
        {
          firstYearEndDate: expiryDateStr,
          waveA: {
            firstNotice: noticeOf(waveALogs.find((l) => l.step === 'FIRST_NOTICE')),
            secondNotice: noticeOf(waveALogs.find((l) => l.step === 'SECOND_NOTICE')),
          },
          waveB: {
            firstNotice: noticeOf(waveBLogs.find((l) => l.step === 'FIRST_NOTICE')),
            secondNotice: noticeOf(waveBLogs.find((l) => l.step === 'SECOND_NOTICE')),
          },
        },
        policy,
      );
    }

    // FULL_YEAR_GRANT(§61①) — reasonCode가 다른 값이거나 없어도(마이그레이션
    // 이관 데이터 등) §61① 절차로 기본 판정한다(더 넓은 절차가 근로자에게
    // 유리한 방향).
    const article611Logs = balance.promotionLogs.filter((l) => l.procedureType === 'ARTICLE_61_1');
    const firstNoticeLog = article611Logs.find((l) => l.step === 'FIRST_NOTICE');

    return determineArticle611Compliance(
      {
        leaveExpiryDate: expiryDateStr,
        firstNotice: noticeOf(firstNoticeLog),
        employeeResponse:
          firstNoticeLog?.receivedAt != null
            ? { receivedAt: toDateString(firstNoticeLog.receivedAt), specifiedUsageDates: firstNoticeLog.requirementMet }
            : null,
        secondNotice: noticeOf(article611Logs.find((l) => l.step === 'SECOND_NOTICE')),
      },
      policy,
    );
  }
}
