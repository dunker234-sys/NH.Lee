import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * STEP11 마감 전 자동 검증이 필요로 하는 정책값. consecutiveWorkdayLimitDays는
 * STEP6이 이미 만든 키를 그대로 재사용한다(schedule-policy-resolver.service.ts와
 * 동일한 "의도된 중복" — 새 키를 만들지 않는다). 월 근로시간 이상치/연장
 * 과다 임계값 2개만 이 STEP의 신규 키다.
 */
export interface PayrollValidationPolicy {
  consecutiveWorkdayLimitDays: number;
  monthlyHoursOutlierThresholdMinutes: number;
  excessiveOvertimeThresholdMinutes: number;
}

const REQUIRED_KEYS: (keyof PayrollValidationPolicy)[] = [
  'consecutiveWorkdayLimitDays',
  'monthlyHoursOutlierThresholdMinutes',
  'excessiveOvertimeThresholdMinutes',
];

@Injectable()
export class PayrollValidationPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: Date): Promise<PayrollValidationPolicy> {
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

    const result = {} as PayrollValidationPolicy;
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
