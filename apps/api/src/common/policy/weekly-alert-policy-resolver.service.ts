import { Injectable } from '@nestjs/common';
import { PolicyConfig, WeeklyAlertThresholdPolicy } from '@attendance/core-rules';
import { PrismaService } from '../prisma/prisma.service';

export type WeeklyAlertFullPolicy = WeeklyAlertThresholdPolicy & Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes'>;

const REQUIRED_KEYS: (keyof WeeklyAlertFullPolicy)[] = [
  'weeklyOvertimeCapMinutes',
  'weeklyStatutoryLimitMinutes',
  'attentionAbsoluteMinutes',
  'attentionRelativeRatio',
  'warningAbsoluteMinutes',
  'warningRelativeRatio',
  'dangerAbsoluteMinutes',
  'dangerRelativeRatio',
];

/**
 * STEP9 52시간 알림 임계값(요구사항서 4.4②) 조립. ApprovalPolicyResolverService와
 * 동일한 패턴 — N개 키를 site+전사 값 단일 쿼리로 가져와 우선순위를 적용하고,
 * 누락된 키는 임의 기본값으로 대체하지 않고 throw한다(CLAUDE.md 절대 규칙4).
 *
 * ★ `weeklyOvertimeCapMinutes`는 PolicyConfigResolverService(recalculation
 * 모듈)가 조립하는 core PolicyConfig와 같은 policy_config 키를 그대로
 * 다시 읽는다 — 값을 여기서 재조립하는 이유는 RecalculationModule을
 * import하면 순환 모듈 의존(Recalculation → WeeklyAlert → Recalculation)이
 * 생기기 때문이다. 같은 키를 두 리졸버가 각자 읽는 것은 정책값 자체가
 * 아니라 "조회 지점"만 중복되는 것이라 CLAUDE.md 절대 규칙4(하드코딩 금지)와
 * 무관하다.
 */
@Injectable()
export class WeeklyAlertPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: Date): Promise<WeeklyAlertFullPolicy> {
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

    const result = {} as WeeklyAlertFullPolicy;
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
