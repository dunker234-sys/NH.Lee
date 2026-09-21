import { convertOvertimeToCompensatoryLeave } from './compensatory-leave-conversion';

const policy = {
  overtimePremiumRate: 0.5,
  nightPremiumRate: 0.5,
  holidayPremiumRateWithin8h: 0.5,
  holidayPremiumRateExcess8h: 1.0,
};

describe('convertOvertimeToCompensatoryLeave — §57 (가산율 반영 보상휴가 환산)', () => {
  it('연장근로 60분@0.5 가산 → 보상휴가 90분(1.5배)', () => {
    const result = convertOvertimeToCompensatoryLeave({ sourceMinutes: 60, sourceCategory: 'OVERTIME' }, policy);
    expect(result.compensatoryLeaveMinutes).toBe(90);
    expect(result.appliedPremiumRate).toBe(0.5);
  });

  it('휴일근로 8h초과분@1.0 가산 → 보상휴가는 2배', () => {
    const result = convertOvertimeToCompensatoryLeave(
      { sourceMinutes: 60, sourceCategory: 'HOLIDAY_EXCESS_8H' },
      policy,
    );
    expect(result.compensatoryLeaveMinutes).toBe(120);
  });

  it('홀수 분 입력도 가산분만큼만 반영하고 floor한다(부동소수점 누적 없음)', () => {
    // 61 * 1.5 = 91.5 -> floor 91
    const result = convertOvertimeToCompensatoryLeave({ sourceMinutes: 61, sourceCategory: 'OVERTIME' }, policy);
    expect(result.compensatoryLeaveMinutes).toBe(91);
  });

  it('휴일근로 8h이내분@0.5 가산도 정상 환산된다', () => {
    const result = convertOvertimeToCompensatoryLeave(
      { sourceMinutes: 60, sourceCategory: 'HOLIDAY_WITHIN_8H' },
      policy,
    );
    expect(result.compensatoryLeaveMinutes).toBe(90);
  });

  it('가산분만 대체하면 체불이므로 원 근로시간(1.0)을 항상 포함한다', () => {
    const result = convertOvertimeToCompensatoryLeave({ sourceMinutes: 100, sourceCategory: 'NIGHT' }, policy);
    expect(result.compensatoryLeaveMinutes).toBeGreaterThan(100);
  });
});
