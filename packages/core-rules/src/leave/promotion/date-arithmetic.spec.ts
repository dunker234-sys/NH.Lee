import { addDays, subtractMonths } from './date-arithmetic';

describe('subtractMonths — 말일 클램핑(단순 setUTCMonth의 "11월 31일→12월 1일 밀림" 버그 방지)', () => {
  it('1월 31일에서 2개월 전은 11월 30일이다(11월 31일이 아니라)', () => {
    expect(subtractMonths('2027-01-31', 2)).toBe('2026-11-30');
  });

  it('3월 31일에서 1개월 전은 2월 28일이다(평년)', () => {
    expect(subtractMonths('2027-03-31', 1)).toBe('2027-02-28');
  });

  it('일(day)이 흘러넘치지 않는 일반적인 경우는 그대로 계산한다', () => {
    expect(subtractMonths('2026-08-24', 12)).toBe('2025-08-24');
  });

  it('연도 경계를 넘어가도 정확하다', () => {
    expect(subtractMonths('2026-01-15', 3)).toBe('2025-10-15');
  });
});

describe('addDays', () => {
  it('월 경계를 넘어 더한다', () => {
    expect(addDays('2026-07-31', 9)).toBe('2026-08-09');
  });
});
