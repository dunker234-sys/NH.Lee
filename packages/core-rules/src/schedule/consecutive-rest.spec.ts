import { checkConsecutiveRestBetweenShifts, RestGap } from './consecutive-rest';

const REQUIRED = 660; // 11시간(§51의2②, §52②)

describe('checkConsecutiveRestBetweenShifts', () => {
  it('간격이 정확히 기준(660분)이면 위반이 아니다', () => {
    const gaps: RestGap[] = [{ afterWorkDate: '2026-08-24', gapMinutes: 660 }];
    const result = checkConsecutiveRestBetweenShifts(gaps, REQUIRED);
    expect(result.violated).toBe(false);
    expect(result.shortGaps).toHaveLength(0);
  });

  it('간격이 기준보다 1분 짧으면(659분) 위반이다', () => {
    const gaps: RestGap[] = [{ afterWorkDate: '2026-08-24', gapMinutes: 659 }];
    const result = checkConsecutiveRestBetweenShifts(gaps, REQUIRED);
    expect(result.violated).toBe(true);
    expect(result.shortGaps).toEqual(gaps);
    expect(result.reasons[0]).toContain('§51의2②');
  });

  it('여러 개의 짧은 간격이 모두 보고된다', () => {
    const gaps: RestGap[] = [
      { afterWorkDate: '2026-08-24', gapMinutes: 500 },
      { afterWorkDate: '2026-08-25', gapMinutes: 700 },
      { afterWorkDate: '2026-08-26', gapMinutes: 600 },
    ];
    const result = checkConsecutiveRestBetweenShifts(gaps, REQUIRED);
    expect(result.violated).toBe(true);
    expect(result.shortGaps.map((g) => g.afterWorkDate)).toEqual(['2026-08-24', '2026-08-26']);
    expect(result.reasons).toHaveLength(2);
  });

  it('빈 배열이면 위반이 아니다', () => {
    const result = checkConsecutiveRestBetweenShifts([], REQUIRED);
    expect(result.violated).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });
});
