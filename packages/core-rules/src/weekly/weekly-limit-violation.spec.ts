import { PolicyConfig } from '../types/policy-config';
import { checkWeeklyLimitViolation } from './weekly-limit-violation';

const policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes' | 'weeklyOvertimeCapMinutes'> = {
  weeklyStatutoryLimitMinutes: 2400,
  weeklyOvertimeCapMinutes: 720,
};

describe('checkWeeklyLimitViolation — 시나리오19,21,22 (한도 위반, 대법 2020도15393)', () => {
  it('월~금 각 10.5h(계 52.5h) → 40h초과분 12.5h → 위반', () => {
    const result = checkWeeklyLimitViolation({
      dailyTotals: Array.from({ length: 5 }, (_, i) => ({ date: `d${i}`, totalWorkMinutes: 630 })),
      policy,
    });
    expect(result.weeklyTotalMinutes).toBe(3150);
    expect(result.excessOver40Minutes).toBe(750);
    expect(result.violated).toBe(true);
  });

  it('월화 13h, 수목 6h, 금 8h(계 46h) → 40h초과분 6h → 위반 아님(일별 8h초과 합산 10h은 판단기준 아님)', () => {
    const result = checkWeeklyLimitViolation({
      dailyTotals: [
        { date: 'mon', totalWorkMinutes: 780 },
        { date: 'tue', totalWorkMinutes: 780 },
        { date: 'wed', totalWorkMinutes: 360 },
        { date: 'thu', totalWorkMinutes: 360 },
        { date: 'fri', totalWorkMinutes: 480 },
      ],
      policy,
    });
    expect(result.weeklyTotalMinutes).toBe(2760);
    expect(result.excessOver40Minutes).toBe(360);
    expect(result.violated).toBe(false);
  });

  it('시나리오21: 휴일 8h를 포함해 주 총 54h → 위반("1주"는 휴일 포함 7일, §2①7호)', () => {
    const result = checkWeeklyLimitViolation({
      dailyTotals: [
        { date: 'mon', totalWorkMinutes: 480 },
        { date: 'tue', totalWorkMinutes: 480 },
        { date: 'wed', totalWorkMinutes: 480 },
        { date: 'thu', totalWorkMinutes: 480 },
        { date: 'fri', totalWorkMinutes: 480 },
        { date: 'sat_holiday', totalWorkMinutes: 840 }, // 평일 40h + 휴일 14h = 54h
      ],
      policy,
    });
    expect(result.weeklyTotalMinutes).toBe(3240);
    expect(result.excessOver40Minutes).toBe(840);
    expect(result.violated).toBe(true);
  });

  it('시나리오22: 미승인 연장도 포함해 판정된다(승인 여부와 무관 — dailyTotals 자체가 이미 미승인 포함 합계)', () => {
    const result = checkWeeklyLimitViolation({
      dailyTotals: [
        { date: 'mon', totalWorkMinutes: 600 }, // 소정8h+미승인2h
        { date: 'tue', totalWorkMinutes: 600 },
        { date: 'wed', totalWorkMinutes: 600 },
        { date: 'thu', totalWorkMinutes: 600 },
        { date: 'fri', totalWorkMinutes: 600 },
      ],
      policy,
    });
    // 승인 여부를 따로 걸러내지 않고 그대로 3000분(50h) 합산 → 초과분 10h → 위반 아님(≤12h)
    expect(result.weeklyTotalMinutes).toBe(3000);
    expect(result.excessOver40Minutes).toBe(600);
    expect(result.violated).toBe(false);
  });
});
