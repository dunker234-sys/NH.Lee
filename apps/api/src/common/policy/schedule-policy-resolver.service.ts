import { Injectable } from '@nestjs/common';
import { FlexibleWorkPolicyConfig } from '@attendance/core-rules';
import { PrismaService } from '../prisma/prisma.service';

export interface SchedulePolicy extends FlexibleWorkPolicyConfig {
  dailyStatutoryLimitMinutes: number;
  weeklyStatutoryLimitMinutes: number;
  weeklyOvertimeCapMinutes: number;
  breakTierThresholdMinutes: number;
  breakTierMinutes: number;
  breakFullTierThresholdMinutes: number;
  breakFullTierMinutes: number;
  /** STEP6 신규 — 근기법에 명문 상한은 없으나 취업규칙/가이드라인 관행값.
   * policy_config화해 사업장별 재정의 가능(CLAUDE.md 절대 규칙4). */
  consecutiveWorkdayLimitDays: number;
}

const REQUIRED_KEYS: (keyof SchedulePolicy)[] = [
  'dailyStatutoryLimitMinutes',
  'weeklyStatutoryLimitMinutes',
  'weeklyOvertimeCapMinutes',
  'breakTierThresholdMinutes',
  'breakTierMinutes',
  'breakFullTierThresholdMinutes',
  'breakFullTierMinutes',
  'biweeklyWeeklyCapMinutes',
  'extendedWeeklyCapMinutes',
  'extendedDailyCapMinutes',
  'continuousRestMinutes',
  'semiannualNoticeDaysBefore',
  'selectiveMonthlyOvertimePremiumRate',
  'consecutiveWorkdayLimitDays',
];

/**
 * 계획근태 즉시 검증(STEP6)이 필요로 하는 정책값 조립. camelCase 키는
 * recalculation 모듈의 PolicyConfigResolverService와 일부(예:
 * weeklyStatutoryLimitMinutes) 겹치지만, 그 모듈은 이 리졸버를 export하지
 * 않고(순환 의존 회피 목적의 기존 컨벤션 — punch-policy-resolver.service.ts
 * 헤더 주석 참고) 두 리졸버가 같은 policy_config 테이블을 각자 읽는 것은
 * 의도된 중복이다. PunchPolicyResolverService와 동일하게 N개 키를 site+전사
 * 값 전부 단일 쿼리로 가져와 메모리에서 우선순위를 적용한다(개별 쿼리
 * 대비 커넥션 풀 경합 방지, 실측으로 확인된 패턴).
 */
@Injectable()
export class SchedulePolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: Date): Promise<SchedulePolicy> {
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

    const result = {} as SchedulePolicy;
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
