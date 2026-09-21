import { PolicyConfig } from '../types/policy-config';

export type RequiredBreakPolicy = Pick<
  PolicyConfig,
  'breakTierThresholdMinutes' | 'breakTierMinutes' | 'breakFullTierThresholdMinutes' | 'breakFullTierMinutes' | 'dailyStatutoryLimitMinutes'
>;

/**
 * §54 "4h당 30분·8h당 60분"을 규정근로 블록과 연장 블록에 독립 적용해 합산한다.
 * break-resolution.ts에서 추출(STEP6) — 계획 단계(planned-break-check.ts)도
 * 같은 §54 티어링이 필요해 재사용한다. 동작은 추출 전과 동일(break-
 * resolution.spec.ts가 회귀 게이트).
 */
export function requiredBreakMinutes(workMinutes: number, policy: RequiredBreakPolicy): number {
  const tierBreak = (w: number): number => {
    if (w >= policy.breakFullTierThresholdMinutes) return policy.breakFullTierMinutes;
    if (w >= policy.breakTierThresholdMinutes) return policy.breakTierMinutes;
    return 0;
  };
  const regularWork = Math.min(workMinutes, policy.dailyStatutoryLimitMinutes);
  const overtimeWork = Math.max(0, workMinutes - policy.dailyStatutoryLimitMinutes);
  return tierBreak(regularWork) + tierBreak(overtimeWork);
}
