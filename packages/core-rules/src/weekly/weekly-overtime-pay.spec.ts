import { PolicyConfig } from '../types/policy-config';
import { calculateWeeklyOvertimePay } from './weekly-overtime-pay';

const policy: Pick<PolicyConfig, 'dailyStatutoryLimitMinutes' | 'weeklyStatutoryLimitMinutes'> = {
  dailyStatutoryLimitMinutes: 480,
  weeklyStatutoryLimitMinutes: 2400,
};

describe('calculateWeeklyOvertimePay — 시나리오20 (가산수당 산정, checkWeeklyLimitViolation과 별도 함수)', () => {
  it('월화 13h, 수목 6h, 금 8h → 일별 8h초과분 10h가 연장 가산 대상(이중계산 방지)', () => {
    const result = calculateWeeklyOvertimePay({
      dailyTotals: [
        { date: 'mon', totalWorkMinutes: 780 },
        { date: 'tue', totalWorkMinutes: 780 },
        { date: 'wed', totalWorkMinutes: 360 },
        { date: 'thu', totalWorkMinutes: 360 },
        { date: 'fri', totalWorkMinutes: 480 },
      ],
      policy,
    });

    expect(result.dailyOvertimeMinutes.find((d) => d.date === 'mon')?.minutes).toBe(300);
    expect(result.dailyOvertimeMinutes.find((d) => d.date === 'tue')?.minutes).toBe(300);
    expect(result.dailyOvertimeMinutes.find((d) => d.date === 'wed')?.minutes).toBe(0);
    expect(result.weeklyBasisOvertimeMinutes).toBe(0); // 소정근로 잔여 합계 36h ≤ 40h
    expect(result.totalOvertimeForPremiumMinutes).toBe(600); // 10h
  });

  it('일별 8h초과가 없어도 소정근로 잔여 합계가 40h를 넘으면 주 단위 연장이 잡힌다', () => {
    const result = calculateWeeklyOvertimePay({
      dailyTotals: Array.from({ length: 6 }, (_, i) => ({ date: `d${i}`, totalWorkMinutes: 420 })), // 7h×6일=42h, 일별 초과 없음
      policy,
    });
    expect(result.dailyOvertimeMinutes.every((d) => d.minutes === 0)).toBe(true);
    expect(result.weeklyBasisOvertimeMinutes).toBe(120); // 42h-40h=2h
    expect(result.totalOvertimeForPremiumMinutes).toBe(120);
  });
});
