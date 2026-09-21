import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HrSyncPolicy {
  hrSyncAutoApplyChangeRatioThreshold: number;
}

const REQUIRED_KEYS: (keyof HrSyncPolicy)[] = ['hrSyncAutoApplyChangeRatioThreshold'];

/**
 * STEP10 자동적용 임계값 조립. WeeklyAlertPolicyResolverService와 동일한
 * 패턴 — 전사(siteId=null) 값만 쓰지만(HR 동기화는 사업장이 아니라 배치
 * 전체 단위 판단), 누락 시 임의 기본값으로 대체하지 않고 throw한다.
 */
@Injectable()
export class HrSyncPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(asOfDate: Date): Promise<HrSyncPolicy> {
    const rows = await this.prisma.policyConfig.findMany({
      where: {
        key: { in: REQUIRED_KEYS },
        siteId: null,
        effectiveStartDate: { lte: asOfDate },
        OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }],
      },
      orderBy: { effectiveStartDate: 'desc' },
    });

    const bestValueByKey = new Map<string, unknown>();
    for (const row of rows) {
      if (!bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value);
    }

    const result = {} as HrSyncPolicy;
    for (const key of REQUIRED_KEYS) {
      if (!bestValueByKey.has(key)) {
        throw new Error(
          `정책값 '${key}'를 policy_config에서 찾을 수 없습니다(기준일 ${asOfDate.toISOString()}). ` +
            `임의 기본값으로 대체하지 않습니다 — CLAUDE.md 절대 규칙 4.`,
        );
      }
      (result as unknown as Record<string, unknown>)[key] = bestValueByKey.get(key);
    }
    return result;
  }
}
