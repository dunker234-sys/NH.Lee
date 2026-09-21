import { calculateWeeklyPaidRestMinutes } from './weekly-paid-rest-minutes';

describe('calculateWeeklyPaidRestMinutes — 주휴시간(시간값) 계산', () => {
  it('표준 5일 근무(주 40h)면 하루 8h(480분)를 반환한다', () => {
    const result = calculateWeeklyPaidRestMinutes({
      eligible: true,
      weeklyScheduledMinutes: 2400,
      scheduledWorkdayCount: 5,
    });
    expect(result.minutes).toBe(480);
    expect(result.breakdown).toHaveLength(1);
  });

  it('6일 근무면 나눗셈 결과를 반올림한다', () => {
    // 2400 / 6 = 400 — 나누어 떨어지는 경우
    const result = calculateWeeklyPaidRestMinutes({
      eligible: true,
      weeklyScheduledMinutes: 2400,
      scheduledWorkdayCount: 6,
    });
    expect(result.minutes).toBe(400);
  });

  it('나누어떨어지지 않으면 Math.round로 반올림한다(사용자 확정)', () => {
    // 2500 / 3 = 833.33... → 반올림하면 833
    const result = calculateWeeklyPaidRestMinutes({
      eligible: true,
      weeklyScheduledMinutes: 2500,
      scheduledWorkdayCount: 3,
    });
    expect(result.minutes).toBe(833);

    // 2501 / 3 = 833.67 → 반올림하면 834
    const result2 = calculateWeeklyPaidRestMinutes({
      eligible: true,
      weeklyScheduledMinutes: 2501,
      scheduledWorkdayCount: 3,
    });
    expect(result2.minutes).toBe(834);
  });

  it('미대상(eligible=false)이면 0분, breakdown 비어있음', () => {
    const result = calculateWeeklyPaidRestMinutes({
      eligible: false,
      weeklyScheduledMinutes: 2400,
      scheduledWorkdayCount: 5,
    });
    expect(result.minutes).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  it('소정근로일수가 0이면(0으로 나누기 금지) eligible이어도 0분을 반환한다', () => {
    const result = calculateWeeklyPaidRestMinutes({
      eligible: true,
      weeklyScheduledMinutes: 2400,
      scheduledWorkdayCount: 0,
    });
    expect(result.minutes).toBe(0);
    expect(result.breakdown).toEqual([]);
    expect(Number.isNaN(result.minutes)).toBe(false);
  });
});
