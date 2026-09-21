export type WageType = 'HOURLY' | 'MONTHLY';

export interface EmployeeWageRateInput {
  wageType: WageType;
  /** HOURLY=시급(원), MONTHLY=월급(원) */
  baseAmount: number;
}

/** 월급제 통상시급 산정 기준 시간(분). 관행상 209h(=12540분)이지만 하드코딩하지
 * 않는다 — CLAUDE.md 절대규칙4에 따라 policy_config에서 읽는다. */
export interface OrdinaryWagePolicy {
  monthlyOrdinaryWageDivisorMinutes: number;
}

/**
 * 통상시급 계산. HOURLY는 시급 그 자체, MONTHLY는 월급 ÷ 기준시간(정책값)으로
 * 환산한다. 원 단위로 반올림한다.
 */
export function calculateOrdinaryHourlyWage(input: { wageRate: EmployeeWageRateInput; policy: OrdinaryWagePolicy }): number {
  if (input.wageRate.wageType === 'HOURLY') {
    return Math.round(input.wageRate.baseAmount);
  }
  const divisorMinutes = input.policy.monthlyOrdinaryWageDivisorMinutes;
  if (divisorMinutes <= 0) return 0;
  return Math.round((input.wageRate.baseAmount / divisorMinutes) * 60);
}

/** 기존 policy_config 가산율 그대로 재사용(신규 키 없음) — daily-attendance.ts와 동일 값. */
export interface WagePremiumPolicy {
  overtimePremiumRate: number;
  nightPremiumRate: number;
  holidayPremiumRateWithin8h: number;
  holidayPremiumRateExcess8h: number;
}

export interface PayrollStatementLineForWage {
  scheduledWorkMinutes: number;
  approvedOvertimeMinutes: number;
  nightWorkMinutes: number;
  holidayWorkMinutesNormal: number;
  holidayWorkMinutesExcess: number;
  weeklyPaidRestMinutes: number;
}

export interface PayrollAmountsBreakdownEntry {
  item: string;
  minutes: number;
  rateMultiplier: number;
  amount: number;
}

export interface CalculatePayrollAmountsResult {
  basePayAmount: number;
  overtimePayAmount: number;
  nightPayAmount: number;
  holidayPayAmount: number;
  weeklyPaidRestPayAmount: number;
  totalPayAmount: number;
  breakdown: PayrollAmountsBreakdownEntry[];
}

/**
 * 산출된 시간값 + 통상시급 + 가산율 정책값으로 금액을 계산한다. 새 법령 판단은
 * 하지 않는다 — 정책값 기반 표준 계산기다. 통상임금 범위 판단(어떤 수당이
 * 통상임금 산정 기초에 포함되는지 등)은 노무 검토 대상이며, 이 결과값(특히
 * totalPayAmount)은 참고용 산출값이지 확정 지급액이 아니다(STEP11 설계 결정,
 * 이 시스템에는 애초에 급여 지급 실행 기능이 없다).
 *
 * 미승인 연장근로시간(unapprovedOvertimeMinutes)은 지급 여부가 급여 담당자
 * 판단 몫이라 이 함수의 금액 계산에는 포함하지 않는다 — PayrollStatementItem에
 * 별도 컬럼으로 항상 표시되므로 담당자가 직접 반영 여부를 판단한다.
 */
export function calculatePayrollAmounts(input: {
  wageRate: EmployeeWageRateInput;
  ordinaryHourlyWageAmount: number;
  statementLine: PayrollStatementLineForWage;
  policy: WagePremiumPolicy;
}): CalculatePayrollAmountsResult {
  const perMinute = input.ordinaryHourlyWageAmount / 60;
  const breakdown: PayrollAmountsBreakdownEntry[] = [];

  let basePayAmount: number;
  if (input.wageRate.wageType === 'MONTHLY') {
    // 월급은 이미 소정근로 대가를 포함한다 — 그대로 기본급으로 채택한다.
    basePayAmount = Math.round(input.wageRate.baseAmount);
    breakdown.push({
      item: 'BASE_PAY_MONTHLY_SALARY',
      minutes: input.statementLine.scheduledWorkMinutes,
      rateMultiplier: 1,
      amount: basePayAmount,
    });
  } else {
    basePayAmount = Math.round(perMinute * input.statementLine.scheduledWorkMinutes);
    breakdown.push({
      item: 'BASE_PAY_HOURLY',
      minutes: input.statementLine.scheduledWorkMinutes,
      rateMultiplier: 1,
      amount: basePayAmount,
    });
  }

  const overtimeRate = 1 + input.policy.overtimePremiumRate;
  const overtimePayAmount = Math.round(perMinute * input.statementLine.approvedOvertimeMinutes * overtimeRate);
  breakdown.push({
    item: 'OVERTIME',
    minutes: input.statementLine.approvedOvertimeMinutes,
    rateMultiplier: overtimeRate,
    amount: overtimePayAmount,
  });

  // 야간은 그 시간에 대한 기본급과 별개로 "가산분만" 추가 지급한다(§56③).
  const nightPayAmount = Math.round(perMinute * input.statementLine.nightWorkMinutes * input.policy.nightPremiumRate);
  breakdown.push({
    item: 'NIGHT_PREMIUM_ONLY',
    minutes: input.statementLine.nightWorkMinutes,
    rateMultiplier: input.policy.nightPremiumRate,
    amount: nightPayAmount,
  });

  const holidayWithin8hRate = 1 + input.policy.holidayPremiumRateWithin8h;
  const holidayExcess8hRate = 1 + input.policy.holidayPremiumRateExcess8h;
  const holidayNormalAmount = Math.round(perMinute * input.statementLine.holidayWorkMinutesNormal * holidayWithin8hRate);
  const holidayExcessAmount = Math.round(perMinute * input.statementLine.holidayWorkMinutesExcess * holidayExcess8hRate);
  const holidayPayAmount = holidayNormalAmount + holidayExcessAmount;
  breakdown.push({
    item: 'HOLIDAY_WITHIN_8H',
    minutes: input.statementLine.holidayWorkMinutesNormal,
    rateMultiplier: holidayWithin8hRate,
    amount: holidayNormalAmount,
  });
  breakdown.push({
    item: 'HOLIDAY_EXCESS_8H',
    minutes: input.statementLine.holidayWorkMinutesExcess,
    rateMultiplier: holidayExcess8hRate,
    amount: holidayExcessAmount,
  });

  const weeklyPaidRestPayAmount = Math.round(perMinute * input.statementLine.weeklyPaidRestMinutes);
  breakdown.push({
    item: 'WEEKLY_PAID_REST',
    minutes: input.statementLine.weeklyPaidRestMinutes,
    rateMultiplier: 1,
    amount: weeklyPaidRestPayAmount,
  });

  const totalPayAmount = basePayAmount + overtimePayAmount + nightPayAmount + holidayPayAmount + weeklyPaidRestPayAmount;

  return { basePayAmount, overtimePayAmount, nightPayAmount, holidayPayAmount, weeklyPaidRestPayAmount, totalPayAmount, breakdown };
}
