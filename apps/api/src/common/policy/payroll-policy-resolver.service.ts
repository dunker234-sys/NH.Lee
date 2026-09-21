import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * STEP11 급여 산출(임금 계산)이 필요로 하는 정책값. overtimePremiumRate 등
 * 4개는 recalculation 모듈의 PolicyConfigResolverService와 같은 policy_config
 * 키를 읽는 "의도된 중복"이다(punch-policy-resolver.service.ts 헤더 주석에
 * 문서화된 기존 컨벤션 — 순환 의존 회피 목적). monthlyOrdinaryWageDivisorMinutes만
 * 이 STEP의 신규 키다.
 */
export interface PayrollPolicy {
  overtimePremiumRate: number;
  nightPremiumRate: number;
  holidayPremiumRateWithin8h: number;
  holidayPremiumRateExcess8h: number;
  /** 월급제 통상시급 산정 기준 시간(분). 관행상 209h=12540분이지만 하드코딩하지 않는다. */
  monthlyOrdinaryWageDivisorMinutes: number;
}

const REQUIRED_KEYS: (keyof PayrollPolicy)[] = [
  'overtimePremiumRate',
  'nightPremiumRate',
  'holidayPremiumRateWithin8h',
  'holidayPremiumRateExcess8h',
  'monthlyOrdinaryWageDivisorMinutes',
];

@Injectable()
export class PayrollPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: Date): Promise<PayrollPolicy> {
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

    const result = {} as PayrollPolicy;
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
