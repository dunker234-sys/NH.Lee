import { FlexibleWorkPolicyConfig } from '../types/policy-config';
import { assertFlexibleWorkEligible, WorkerProfile } from './eligibility-guard';
import { checkConsecutiveRestBetweenShifts } from '../schedule/consecutive-rest';

export interface SelectiveMonthlyExcessInput {
  worker: WorkerProfile;
  agreementInPlace: boolean;
  /** 정산기간 총 실근로(분) */
  totalWorkedMinutes: number;
  /** 평균 40h 기준의 그 정산기간 기준시간(예: 40h × 그 기간 주수) */
  standardMinutes: number;
  /** 근무일 사이 실제 확보된 휴식 간격들(분) */
  restGapsMinutes: number[];
  policy: Pick<FlexibleWorkPolicyConfig, 'continuousRestMinutes' | 'selectiveMonthlyOvertimePremiumRate'>;
}

export interface SelectiveMonthlyExcessResult {
  /** 평균 40h 초과분(분). 가산율은 별도 필드로 반환한다 — 분 단위 값에 배율을
   * 곱해 소수 분이 생기지 않게 한다(부동소수점 금지, 급여 단계에서 금액으로 환산). */
  excessMinutes: number;
  premiumRate: number;
  restViolation: boolean;
}

/**
 * 선택적 근로시간제 1개월 초과정산(§52 단서). 연속 11시간 휴식을 요구하고,
 * 매 1개월마다 평균 40h 초과분에 50% 가산을 적용한다. ★ 이 함수는
 * calculateWeeklyOvertimePay(§56①)를 절대 호출하지 않는다 — 이 모드에서는
 * §56①이 적용되지 않는다(시나리오30). import하지 않는 것 자체가 그 보장이다.
 */
export function calculateSelectiveMonthlyExcessSettlement(
  input: SelectiveMonthlyExcessInput,
): SelectiveMonthlyExcessResult {
  assertFlexibleWorkEligible(input.worker, input.agreementInPlace);

  const excessMinutes = Math.max(0, input.totalWorkedMinutes - input.standardMinutes);
  const restViolation = checkConsecutiveRestBetweenShifts(
    input.restGapsMinutes.map((gapMinutes, i) => ({ afterWorkDate: `gap-${i}`, gapMinutes })),
    input.policy.continuousRestMinutes,
  ).violated;

  return { excessMinutes, premiumRate: input.policy.selectiveMonthlyOvertimePremiumRate, restViolation };
}
