import { PolicyConfig, FlexibleWorkPolicyConfig } from '../types/policy-config';
import { checkBiweeklyFlexibleWork } from './biweekly';

const policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes'> & Pick<FlexibleWorkPolicyConfig, 'biweeklyWeeklyCapMinutes'> = {
  weeklyStatutoryLimitMinutes: 2400,
  biweeklyWeeklyCapMinutes: 2880, // 48h
};
const worker = { isMinor: false, isPregnant: false };

describe('checkBiweeklyFlexibleWork — 시나리오26 (탄력적 2주제)', () => {
  it('평균 40h 이내이고 특정 주 48h를 넘지 않으면 위반 아님', () => {
    const result = checkBiweeklyFlexibleWork({
      worker,
      agreementInPlace: true,
      weeklyTotals: [
        { weekStartDate: 'w1', totalMinutes: 2700 }, // 45h
        { weekStartDate: 'w2', totalMinutes: 2100 }, // 35h, 평균 40h
      ],
      policy,
    });
    expect(result.violated).toBe(false);
  });

  it('특정 주가 48h를 넘으면 평균이 40h 이내라도 위반', () => {
    const result = checkBiweeklyFlexibleWork({
      worker,
      agreementInPlace: true,
      weeklyTotals: [
        { weekStartDate: 'w1', totalMinutes: 2940 }, // 49h > 48h
        { weekStartDate: 'w2', totalMinutes: 1860 }, // 31h, 평균은 정확히 40h
      ],
      policy,
    });
    expect(result.violated).toBe(true);
    expect(result.reasons.some((r) => r.includes('48'))).toBe(true);
  });

  it('평균이 40h를 넘으면 위반', () => {
    const result = checkBiweeklyFlexibleWork({
      worker,
      agreementInPlace: true,
      weeklyTotals: [
        { weekStartDate: 'w1', totalMinutes: 2500 },
        { weekStartDate: 'w2', totalMinutes: 2500 },
      ],
      policy,
    });
    expect(result.violated).toBe(true);
    expect(result.reasons.some((r) => r.includes('40'))).toBe(true);
  });
});
