import { PolicyConfig } from '../types/policy-config';

export type OvertimeSourceCategory = 'OVERTIME' | 'NIGHT' | 'HOLIDAY_WITHIN_8H' | 'HOLIDAY_EXCESS_8H';

export interface CompensatoryLeaveConversionInput {
  sourceMinutes: number;
  sourceCategory: OvertimeSourceCategory;
}

export interface CompensatoryLeaveConversionResult {
  compensatoryLeaveMinutes: number;
  appliedPremiumRate: number;
}

function rateFor(
  category: OvertimeSourceCategory,
  policy: Pick<
    PolicyConfig,
    'overtimePremiumRate' | 'nightPremiumRate' | 'holidayPremiumRateWithin8h' | 'holidayPremiumRateExcess8h'
  >,
): number {
  switch (category) {
    case 'OVERTIME':
      return policy.overtimePremiumRate;
    case 'NIGHT':
      return policy.nightPremiumRate;
    case 'HOLIDAY_WITHIN_8H':
      return policy.holidayPremiumRateWithin8h;
    case 'HOLIDAY_EXCESS_8H':
      return policy.holidayPremiumRateExcess8h;
  }
}

/**
 * §57 보상휴가 환산 — 가산율을 반영한다(요구사항서4.3 §2: "연장 1h →
 * 보상휴가 1.5h", 가산분만 대체하면 체불). premium-rate.ts의 가산율
 * 값들은 이미 "더해지는 가산분"이므로(0.5=+50%) 배율은 (1+rate)다.
 * 한 번의 곱셈+floor만 쓴다 — 부동소수점을 누적하지 않는다(절대 규칙6과
 * 같은 정신, 최종 정수분 산출 시점에만 한 번 반올림).
 */
export function convertOvertimeToCompensatoryLeave(
  input: CompensatoryLeaveConversionInput,
  policy: Pick<
    PolicyConfig,
    'overtimePremiumRate' | 'nightPremiumRate' | 'holidayPremiumRateWithin8h' | 'holidayPremiumRateExcess8h'
  >,
): CompensatoryLeaveConversionResult {
  const rate = rateFor(input.sourceCategory, policy);
  const compensatoryLeaveMinutes = Math.floor(input.sourceMinutes * (1 + rate));
  return { compensatoryLeaveMinutes, appliedPremiumRate: rate };
}
