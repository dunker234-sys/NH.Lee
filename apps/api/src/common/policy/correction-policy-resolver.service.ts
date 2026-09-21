import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CorrectionPolicy {
  /** 근로일이 속한 달 종료 후 이 값(일) 이내에만 정정을 신청할 수 있다. */
  correctionRequestDeadlineDaysAfterMonthEnd: number;
  /** 0이 아니면 SITE_MANAGER 1차 승인만으로는 부족하고 권역/HQ 2차 승인이 필요하다. */
  correctionRequiresSecondApproval: number;
}

const REQUIRED_KEYS: (keyof CorrectionPolicy)[] = [
  'correctionRequestDeadlineDaysAfterMonthEnd',
  'correctionRequiresSecondApproval',
];

/**
 * STEP8 정정 신청 기한·2차 승인 요건에 필요한 정책값 조립.
 * ApprovalPolicyResolverService/SchedulePolicyResolverService와 동일한 패턴 —
 * site+전사 값을 단일 쿼리로 가져와 우선순위를 적용하고, 누락된 키는 임의
 * 기본값으로 대체하지 않고 throw한다(CLAUDE.md 절대 규칙 4).
 */
@Injectable()
export class CorrectionPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: Date): Promise<CorrectionPolicy> {
    const rows = await this.prisma.policyConfig.findMany({
      where: {
        key: { in: REQUIRED_KEYS },
        AND: [
          { OR: [{ siteId }, { siteId: null }] },
          { effectiveStartDate: { lte: asOfDate } },
          { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }] },
        ],
      },
      orderBy: { effectiveStartDate: 'desc' },
    });

    const bestValueByKey = new Map<string, unknown>();
    for (const row of rows) {
      if (row.siteId === siteId && !bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value);
    }
    for (const row of rows) {
      if (row.siteId === null && !bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value);
    }

    const result = {} as CorrectionPolicy;
    for (const key of REQUIRED_KEYS) {
      if (!bestValueByKey.has(key)) {
        throw new Error(
          `정책값 '${key}'를 policy_config에서 찾을 수 없습니다(사업장 ${siteId}, 기준일 ${asOfDate.toISOString()}). ` +
            `임의 기본값으로 대체하지 않습니다 — CLAUDE.md 절대 규칙 4.`,
        );
      }
      (result as unknown as Record<string, unknown>)[key] = bestValueByKey.get(key);
    }
    return result;
  }
}
