import { FlexibleWorkPolicyConfig, PolicyConfig } from '../types/policy-config';
import { checkQuarterlyFlexibleWork } from './quarterly';

const policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes'> &
  Pick<FlexibleWorkPolicyConfig, 'extendedWeeklyCapMinutes' | 'extendedDailyCapMinutes'> = {
  weeklyStatutoryLimitMinutes: 2400,
  extendedWeeklyCapMinutes: 3120, // 52h
  extendedDailyCapMinutes: 720, // 12h
};
const worker = { isMinor: false, isPregnant: false };

describe('checkQuarterlyFlexibleWork — 시나리오27 (탄력적 3개월제)', () => {
  it('평균 40h, 특정주 52h 이내, 특정일 12h 이내 → 위반 아님', () => {
    const result = checkQuarterlyFlexibleWork({
      worker,
      agreementInPlace: true,
      weeklyTotals: [{ weekStartDate: 'w1', totalMinutes: 2400 }],
      dailyTotals: [{ date: 'd1', totalMinutes: 720 }],
      policy,
    });
    expect(result.violated).toBe(false);
  });

  it('특정일이 12h를 넘으면 위반', () => {
    const result = checkQuarterlyFlexibleWork({
      worker,
      agreementInPlace: true,
      weeklyTotals: [{ weekStartDate: 'w1', totalMinutes: 2400 }],
      dailyTotals: [{ date: 'd1', totalMinutes: 780 }], // 13h
      policy,
    });
    expect(result.violated).toBe(true);
    expect(result.reasons.some((r) => r.includes('12시간'))).toBe(true);
  });

  it('특정 주가 52h를 넘으면 위반', () => {
    const result = checkQuarterlyFlexibleWork({
      worker,
      agreementInPlace: true,
      weeklyTotals: [{ weekStartDate: 'w1', totalMinutes: 3180 }], // 53h
      dailyTotals: [],
      policy,
    });
    expect(result.violated).toBe(true);
    expect(result.reasons.some((r) => r.includes('52시간'))).toBe(true);
  });
});
