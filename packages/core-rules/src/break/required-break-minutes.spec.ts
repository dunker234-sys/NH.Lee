import { requiredBreakMinutes, RequiredBreakPolicy } from './required-break-minutes';

const policy: RequiredBreakPolicy = {
  breakTierThresholdMinutes: 240,
  breakTierMinutes: 30,
  breakFullTierThresholdMinutes: 480,
  breakFullTierMinutes: 60,
  dailyStatutoryLimitMinutes: 480,
};

describe('requiredBreakMinutes', () => {
  it('4시간 미만은 휴게 의무가 없다', () => {
    expect(requiredBreakMinutes(239, policy)).toBe(0);
  });

  it('4시간 이상 8시간 미만은 30분', () => {
    expect(requiredBreakMinutes(240, policy)).toBe(30);
    expect(requiredBreakMinutes(479, policy)).toBe(30);
  });

  it('8시간 이상(법정근로 한도 내)은 60분', () => {
    expect(requiredBreakMinutes(480, policy)).toBe(60);
  });

  it('연장구간에도 별도 휴게가 독립 가산된다(대법원 2020도15393)', () => {
    // 480(법정) + 240(연장) = 720분. 법정 블록 60 + 연장 블록(240→4h구간) 30 = 90.
    expect(requiredBreakMinutes(720, policy)).toBe(90);
  });

  it('연장이 4시간 미만이면 연장 블록 휴게는 0', () => {
    // 480(법정, 60분) + 120(연장, <240이라 0) = 480+120=600.
    expect(requiredBreakMinutes(600, policy)).toBe(60);
  });
});
