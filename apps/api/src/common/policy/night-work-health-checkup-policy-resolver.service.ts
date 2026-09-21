import { Injectable } from '@nestjs/common';
import { NightWorkHealthCheckupPolicy } from '@attendance/core-rules';
import { PrismaService } from '../prisma/prisma.service';

const REQUIRED_KEYS: (keyof NightWorkHealthCheckupPolicy)[] = [
  'criterion1MinConsecutiveMinutes',
  'criterion1MonthlyAvgThreshold',
  'criterion2MonthlyAvgMinutesThreshold',
  'monthsInWindow',
  'criterion1BandStartMinuteOfDay',
  'criterion1BandEndMinuteOfDay',
  'criterion2BandStartMinuteOfDay',
  'criterion2BandEndMinuteOfDay',
];

/**
 * STEP9 야간작업 특수건강진단(산안법 §130, 시행규칙 별표22 제4호) 정책값 조립.
 * ApprovalPolicyResolverService와 동일한 패턴.
 */
@Injectable()
export class NightWorkHealthCheckupPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: Date): Promise<NightWorkHealthCheckupPolicy> {
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

    const result = {} as NightWorkHealthCheckupPolicy;
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
