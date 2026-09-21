import { FlexibleWorkPolicyConfig, PolicyConfig } from '../types/policy-config';
import { checkSemiannualFlexibleWork } from './semiannual';

const policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes'> &
  Pick<FlexibleWorkPolicyConfig, 'extendedWeeklyCapMinutes' | 'extendedDailyCapMinutes' | 'continuousRestMinutes' | 'semiannualNoticeDaysBefore'> = {
  weeklyStatutoryLimitMinutes: 2400,
  extendedWeeklyCapMinutes: 3120,
  extendedDailyCapMinutes: 720,
  continuousRestMinutes: 660, // 11h
  semiannualNoticeDaysBefore: 14,
};
const worker = { isMinor: false, isPregnant: false };

function baseInput() {
  return {
    worker,
    agreementInPlace: true,
    weeklyTotals: [{ weekStartDate: 'w1', totalMinutes: 2400 }],
    dailyTotals: [{ date: 'd1', totalMinutes: 480 }],
    restGapsMinutes: [720, 700],
    noticeGivenAt: '2026-01-01T00:00:00.000Z',
    arrangementStartAt: '2026-01-20T00:00:00.000Z', // 19일 전 통보
    policy,
  };
}

describe('checkSemiannualFlexibleWork — 시나리오28 (탄력적 6개월제)', () => {
  it('모든 조건을 충족하면 위반 아님', () => {
    expect(checkSemiannualFlexibleWork(baseInput()).violated).toBe(false);
  });

  it('연속 11시간 휴식이 확보되지 않으면 위반(§51의2②)', () => {
    const result = checkSemiannualFlexibleWork({ ...baseInput(), restGapsMinutes: [600, 700] }); // 600<660
    expect(result.violated).toBe(true);
    expect(result.reasons.some((r) => r.includes('11시간'))).toBe(true);
  });

  it('평균 1주 40시간을 초과하면 위반', () => {
    const result = checkSemiannualFlexibleWork({
      ...baseInput(),
      weeklyTotals: [{ weekStartDate: 'w1', totalMinutes: 2500 }],
    });
    expect(result.violated).toBe(true);
    expect(result.reasons.some((r) => r.includes('40시간'))).toBe(true);
  });

  it('특정 주가 52시간을 초과하면 위반', () => {
    const result = checkSemiannualFlexibleWork({
      ...baseInput(),
      weeklyTotals: [{ weekStartDate: 'w1', totalMinutes: 3180 }], // 53h
    });
    expect(result.violated).toBe(true);
    expect(result.reasons.some((r) => r.includes('52시간'))).toBe(true);
  });

  it('특정일이 12시간을 초과하면 위반', () => {
    const result = checkSemiannualFlexibleWork({
      ...baseInput(),
      dailyTotals: [{ date: 'd1', totalMinutes: 780 }], // 13h
    });
    expect(result.violated).toBe(true);
    expect(result.reasons.some((r) => r.includes('12시간'))).toBe(true);
  });

  it('2주 전 통보 기한을 지키지 못하면 위반', () => {
    const result = checkSemiannualFlexibleWork({
      ...baseInput(),
      noticeGivenAt: '2026-01-10T00:00:00.000Z',
      arrangementStartAt: '2026-01-20T00:00:00.000Z', // 10일 전 통보 — 14일 미달
    });
    expect(result.violated).toBe(true);
    expect(result.reasons.some((r) => r.includes('통보'))).toBe(true);
  });
});
