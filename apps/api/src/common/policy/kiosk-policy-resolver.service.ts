import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface KioskPolicy {
  pinMaxFailedAttempts: number;
  pinLockoutMinutes: number;
}

const KEY_MAP: Record<keyof KioskPolicy, string> = {
  pinMaxFailedAttempts: 'kiosk_pin_max_failed_attempts',
  pinLockoutMinutes: 'kiosk_pin_lockout_minutes',
};

/**
 * 키오스크 PIN 잠금 policy_config를 조립한다. 비밀번호 잠금 임계값
 * (MAX_FAILED_LOGIN_ATTEMPTS/LOCKOUT_DURATION_MINUTES)은 env 변수인데
 * 이 값은 그러지 않는다 — PIN은 이번 STEP에서 새로 만드는 값이라
 * CLAUDE.md 절대 규칙4("법령 수치는 policy_config에서 읽는다")를 처음부터
 * 지킨다. PunchPolicyResolverService가 이미 확립한 "필요한 키 전부 단일
 * 쿼리로" 형태를 따른다.
 */
@Injectable()
export class KioskPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: Date): Promise<KioskPolicy> {
    const entries = Object.entries(KEY_MAP) as [keyof KioskPolicy, string][];
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

    const result = {} as KioskPolicy;
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
