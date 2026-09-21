import { Injectable } from '@nestjs/common';
import { determineAnnualLeaveApplicability, HeadcountPeriod } from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * SiteHeadcountHistory.leaveApplicable은 캐시 컬럼일 뿐이다(다른 STEP1
 * 캐시 컬럼과 같은 취급 원칙 — Site.headcountCache 등) — 신뢰하지 않고
 * 매번 원본 이력에서 HeadcountPeriod[]를 조립해 core-rules의
 * determineAnnualLeaveApplicability()로 재판정한다.
 *
 * annualLeaveMinContinuousMonths는 recalculation-policy-defaults.ts가
 * 이미 시딩한 전사 공용 키를 직접 조회한다 — schedule-policy-resolver.ts
 * 등 여러 리졸버가 이 키를 각자 읽는 것과 같은 의도된 중복 패턴이다
 * (LeavePolicyResolverService의 REQUIRED_KEYS에는 없는 키라 별도 조회).
 */
@Injectable()
export class LeaveHeadcountApplicabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async isApplicable(siteId: string, referenceDate: string): Promise<boolean> {
    const [rows, policy] = await Promise.all([
      this.prisma.siteHeadcountHistory.findMany({ where: { siteId }, orderBy: { effectiveStartDate: 'asc' } }),
      this.resolveMinContinuousMonths(siteId, referenceDate),
    ]);
    const periods: HeadcountPeriod[] = rows.map((r) => ({
      startDate: r.effectiveStartDate.toISOString().slice(0, 10),
      endDate: r.effectiveEndDate ? r.effectiveEndDate.toISOString().slice(0, 10) : null,
      isUnderFive: r.isUnderFive,
    }));
    return determineAnnualLeaveApplicability(referenceDate, periods, policy);
  }

  private async resolveMinContinuousMonths(
    siteId: string,
    referenceDate: string,
  ): Promise<{ annualLeaveMinContinuousMonths: number }> {
    const asOfDate = new Date(`${referenceDate}T00:00:00.000Z`);
    const rows = await this.prisma.policyConfig.findMany({
      where: {
        key: 'annualLeaveMinContinuousMonths',
        AND: [
          { OR: [{ siteId }, { siteId: null }] },
          { effectiveStartDate: { lte: asOfDate } },
          { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }] },
        ],
      },
      orderBy: { effectiveStartDate: 'desc' },
    });
    const value = (rows.find((r) => r.siteId === siteId) ?? rows.find((r) => r.siteId === null))?.value;
    if (typeof value !== 'number') {
      throw new Error(
        `정책값 'annualLeaveMinContinuousMonths'를 policy_config에서 찾을 수 없습니다(사업장 ${siteId}, 기준일 ${referenceDate}). CLAUDE.md 절대 규칙4.`,
      );
    }
    return { annualLeaveMinContinuousMonths: value };
  }
}
