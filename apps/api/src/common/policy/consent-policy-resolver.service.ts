import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ConsentPolicy {
  locationRetentionDays: number;
  locationConsentPolicyVersion: string;
}

const KEY_MAP: Record<keyof ConsentPolicy, string> = {
  // PunchPolicyResolverService가 이미 쓰는 값과 같은 policy_config 키를
  // 그대로 재조회한다 — 새 키를 만들지 않는다(같은 값의 정의가 두 곳에
  // 생기면 드리프트 위험).
  locationRetentionDays: 'location_retention_days',
  locationConsentPolicyVersion: 'location_consent_policy_version',
};

/**
 * 위치정보 동의 화면(ConsentGateScreen 등)이 표시할 법정 고지 항목용
 * policy_config를 조립한다. PunchPolicyResolverService와 달리 siteId를
 * 필수로 요구하지 않는다 — 동의는 특정 사업장에 묶인 개념이 아니라
 * 직원 단위 개념이라, siteId를 강제하면 호출부가 임의로 사업장 하나를
 * 골라야 하는 부자연스러움이 생긴다(NotificationPolicyResolverService와
 * 같은 이유로 siteId: string | null을 받는다).
 */
@Injectable()
export class ConsentPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string | null, asOfDate: Date): Promise<ConsentPolicy> {
    const entries = Object.entries(KEY_MAP) as [keyof ConsentPolicy, string][];
    const keys = entries.map(([, key]) => key);

    const rows = await this.prisma.policyConfig.findMany({
      where: {
        key: { in: keys },
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

    const result = {} as ConsentPolicy;
    for (const [field, key] of entries) {
      if (!bestValueByKey.has(key)) {
        throw new Error(
          `정책값 '${key}'를 policy_config에서 찾을 수 없습니다(사업장 ${siteId}, 기준일 ${asOfDate.toISOString()}). ` +
            `임의 기본값으로 대체하지 않습니다 — CLAUDE.md 절대 규칙 4.`,
        );
      }
      (result as unknown as Record<string, unknown>)[field] = bestValueByKey.get(key);
    }
    return result;
  }
}
