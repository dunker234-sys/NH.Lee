import { calculateOrdinaryHourlyWage, calculatePayrollAmounts, PayrollStatementLineForWage } from './wage-calculation';

const PREMIUM_POLICY = {
  overtimePremiumRate: 0.5,
  nightPremiumRate: 0.5,
  holidayPremiumRateWithin8h: 0.5,
  holidayPremiumRateExcess8h: 1.0,
};

function emptyLine(overrides: Partial<PayrollStatementLineForWage> = {}): PayrollStatementLineForWage {
  return {
    scheduledWorkMinutes: 0,
    approvedOvertimeMinutes: 0,
    nightWorkMinutes: 0,
    holidayWorkMinutesNormal: 0,
    holidayWorkMinutesExcess: 0,
    weeklyPaidRestMinutes: 0,
    ...overrides,
  };
}

describe('calculateOrdinaryHourlyWage — 통상시급 계산', () => {
  it('HOURLY는 시급 그 자체를 반환한다', () => {
    const wage = calculateOrdinaryHourlyWage({
      wageRate: { wageType: 'HOURLY', baseAmount: 10030 },
      policy: { monthlyOrdinaryWageDivisorMinutes: 12540 },
    });
    expect(wage).toBe(10030);
  });

  it('MONTHLY는 월급 ÷ 기준시간(정책값)으로 환산한다(209h=12540분)', () => {
    const wage = calculateOrdinaryHourlyWage({
      wageRate: { wageType: 'MONTHLY', baseAmount: 2093000 },
      policy: { monthlyOrdinaryWageDivisorMinutes: 12540 },
    });
    // 2,093,000 / 209 = 10,014.35... → 반올림 10,014
    expect(wage).toBe(10014);
  });

  it('기준시간이 0 이하이면(가드) 0을 반환한다', () => {
    const wage = calculateOrdinaryHourlyWage({
      wageRate: { wageType: 'MONTHLY', baseAmount: 2000000 },
      policy: { monthlyOrdinaryWageDivisorMinutes: 0 },
    });
    expect(wage).toBe(0);
    expect(Number.isNaN(wage)).toBe(false);
  });
});

describe('calculatePayrollAmounts — 가산임금 계산', () => {
  it('MONTHLY는 월급을 기본급으로 그대로 채택한다', () => {
    const result = calculatePayrollAmounts({
      wageRate: { wageType: 'MONTHLY', baseAmount: 2000000 },
      ordinaryHourlyWageAmount: 10000,
      statementLine: emptyLine({ scheduledWorkMinutes: 9600 }),
      policy: PREMIUM_POLICY,
    });
    expect(result.basePayAmount).toBe(2000000);
  });

  it('HOURLY는 소정근로시간 × 통상시급으로 기본급을 계산한다', () => {
    const result = calculatePayrollAmounts({
      wageRate: { wageType: 'HOURLY', baseAmount: 10000 },
      ordinaryHourlyWageAmount: 10000,
      statementLine: emptyLine({ scheduledWorkMinutes: 480 }),
      policy: PREMIUM_POLICY,
    });
    // perMinute = 10000/60 = 166.67, ×480 = 80000
    expect(result.basePayAmount).toBe(80000);
  });

  it('연장근로수당은 통상시급×시간×(1+가산율) 전액으로 계산한다', () => {
    const result = calculatePayrollAmounts({
      wageRate: { wageType: 'HOURLY', baseAmount: 10000 },
      ordinaryHourlyWageAmount: 10000,
      statementLine: emptyLine({ approvedOvertimeMinutes: 60 }),
      policy: PREMIUM_POLICY,
    });
    // perMinute=166.67, ×60×1.5 = 15000
    expect(result.overtimePayAmount).toBe(15000);
  });

  it('야간근로수당은 가산분만(전액이 아닌) 계산한다', () => {
    const result = calculatePayrollAmounts({
      wageRate: { wageType: 'HOURLY', baseAmount: 6000 },
      ordinaryHourlyWageAmount: 6000,
      statementLine: emptyLine({ nightWorkMinutes: 60 }),
      policy: PREMIUM_POLICY,
    });
    // perMinute=100, ×60×0.5(가산율만) = 3000
    expect(result.nightPayAmount).toBe(3000);
  });

  it('휴일근로수당은 8h 이내/초과 가산율을 각각 적용해 합산한다', () => {
    const result = calculatePayrollAmounts({
      wageRate: { wageType: 'HOURLY', baseAmount: 6000 },
      ordinaryHourlyWageAmount: 6000,
      statementLine: emptyLine({ holidayWorkMinutesNormal: 480, holidayWorkMinutesExcess: 60 }),
      policy: PREMIUM_POLICY,
    });
    // perMinute=100. 이내: 480×1.5=72000. 초과: 60×2.0=12000. 합계 84000
    expect(result.holidayPayAmount).toBe(84000);
  });

  it('미승인 연장근로시간은 금액 계산에 포함하지 않는다(지급 여부는 급여 담당자 판단)', () => {
    const withUnapproved = calculatePayrollAmounts({
      wageRate: { wageType: 'HOURLY', baseAmount: 10000 },
      ordinaryHourlyWageAmount: 10000,
      statementLine: emptyLine({ approvedOvertimeMinutes: 60 }),
      policy: PREMIUM_POLICY,
    });
    // statementLine에는 unapprovedOvertimeMinutes 필드 자체가 없다 — 타입상으로도
    // 이 함수가 미승인분을 계산에 반영할 수 없음을 보증한다.
    expect(withUnapproved.totalPayAmount).toBe(withUnapproved.overtimePayAmount);
  });

  it('totalPayAmount는 모든 항목의 합계다', () => {
    const result = calculatePayrollAmounts({
      wageRate: { wageType: 'MONTHLY', baseAmount: 2000000 },
      ordinaryHourlyWageAmount: 10000,
      statementLine: emptyLine({
        approvedOvertimeMinutes: 60,
        nightWorkMinutes: 60,
        holidayWorkMinutesNormal: 60,
        weeklyPaidRestMinutes: 480,
      }),
      policy: PREMIUM_POLICY,
    });
    const sum =
      result.basePayAmount +
      result.overtimePayAmount +
      result.nightPayAmount +
      result.holidayPayAmount +
      result.weeklyPaidRestPayAmount;
    expect(result.totalPayAmount).toBe(sum);
  });
});
