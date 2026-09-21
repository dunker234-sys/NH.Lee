import { calculateSeniorityAddonDays } from './seniority-addon';

const policy = { annualLeaveSeniorityIntervalYears: 2 };

describe('calculateSeniorityAddonDays — §60④ (3년 이상 매 2년 1일 가산)', () => {
  it('1년차/2년차는 가산 없음', () => {
    expect(calculateSeniorityAddonDays(1, policy)).toBe(0);
    expect(calculateSeniorityAddonDays(2, policy)).toBe(0);
  });

  it('3년차부터 1일 가산', () => {
    expect(calculateSeniorityAddonDays(3, policy)).toBe(1);
  });

  it('5년차는 2일, 7년차는 3일 가산(2년마다 1일)', () => {
    expect(calculateSeniorityAddonDays(5, policy)).toBe(2);
    expect(calculateSeniorityAddonDays(7, policy)).toBe(3);
  });

  it('21년차에 가산 10일로 상한(총 25일) 도달 지점에 이른다', () => {
    expect(calculateSeniorityAddonDays(21, policy)).toBe(10);
  });

  it('상한 도달 이후(23년차)에도 가산분 자체는 계속 늘어난다 — 총합 캡은 합성 함수의 책임', () => {
    expect(calculateSeniorityAddonDays(23, policy)).toBe(11);
  });
});
