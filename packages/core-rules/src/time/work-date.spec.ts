import { kstCalendarDate, kstMidnightIso, kstMinuteOfDay } from './work-date';

describe('kstCalendarDate', () => {
  it('KST 05:00은 UTC 전날 20:00이지만 KST 기준 당일로 계산된다 (시나리오37 관련 기반 유틸)', () => {
    // 2026-08-24 05:00 KST = 2026-08-23 20:00 UTC
    expect(kstCalendarDate('2026-08-23T20:00:00.000Z')).toBe('2026-08-24');
  });

  it('UTC 자정 직후(KST 오전 9시)는 같은 KST 날짜다', () => {
    expect(kstCalendarDate('2026-08-24T00:00:00.000Z')).toBe('2026-08-24');
  });

  it('KST 자정 직전(23:59)은 여전히 그날이다', () => {
    // 2026-08-24 23:59 KST = 2026-08-24 14:59 UTC
    expect(kstCalendarDate('2026-08-24T14:59:00.000Z')).toBe('2026-08-24');
  });
});

describe('kstMidnightIso', () => {
  it('KST 자정을 UTC 인스턴트로 정확히 변환한다', () => {
    expect(kstMidnightIso('2026-08-24')).toBe('2026-08-23T15:00:00.000Z');
  });
});

describe('kstMinuteOfDay', () => {
  it('KST 22:00은 1320분이다', () => {
    // 2026-08-24 22:00 KST = 2026-08-24 13:00 UTC
    expect(kstMinuteOfDay('2026-08-24T13:00:00.000Z')).toBe(22 * 60);
  });

  it('KST 05:00은 300분이다', () => {
    expect(kstMinuteOfDay('2026-08-23T20:00:00.000Z')).toBe(5 * 60);
  });
});
