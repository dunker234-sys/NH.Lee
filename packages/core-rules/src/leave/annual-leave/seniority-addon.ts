import { AnnualLeavePolicyConfig } from '../../types/policy-config';

/**
 * §60④ — 최초 1년을 초과하는 계속근로연수 매 N년(정책값, 기본 2년)에
 * 대하여 1일을 가산한다. 총 상한(25일) 적용은 이 함수의 책임이 아니다 —
 * 합성 함수(annual-leave-grant.ts)가 base+addon을 더한 뒤 캡을 씌운다.
 */
export function calculateSeniorityAddonDays(
  yearsOfService: number,
  policy: Pick<AnnualLeavePolicyConfig, 'annualLeaveSeniorityIntervalYears'>,
): number {
  if (yearsOfService < 3) return 0;
  return Math.floor((yearsOfService - 1) / policy.annualLeaveSeniorityIntervalYears);
}
