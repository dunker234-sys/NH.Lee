import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * recalculation 모듈의 LaborAgreementResolverService(직원 단위,
 * employee.primarySiteId 기준)와 별개다 — 그 서비스는 모듈이 export하지
 * 않아 재사용 대상이 아니며(§ 기존 컨벤션), 애초에 판정 축이 다르다.
 * STEP6의 "제도 도입 근거가 없는 사업장에 유연근로제 배정 시 차단"은
 * 직원이 아니라 사업장 단독으로 판정해야 한다.
 */
export const FLEXIBLE_WORK_AGREEMENT_TYPES = [
  'FLEXIBLE_BIWEEKLY',
  'FLEXIBLE_QUARTERLY',
  'FLEXIBLE_SEMIANNUAL',
  'SELECTIVE_MONTHLY',
] as const;

@Injectable()
export class SiteLaborAgreementResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /** 그 사업장에 asOfDate 기준 활성인 agreementType 서면합의가 있으면 true. */
  async hasActiveFlexibleWorkAgreement(siteId: string, asOfDate: Date, agreementType: string): Promise<boolean> {
    const agreement = await this.prisma.laborAgreement.findFirst({
      where: {
        agreementType,
        AND: [
          { OR: [{ siteId }, { siteId: null }] },
          { effectiveStartDate: { lte: asOfDate } },
          { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }] },
        ],
      },
    });
    return agreement != null;
  }
}
