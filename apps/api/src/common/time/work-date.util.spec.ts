import { deriveWorkDate, deriveWorkDateString } from './work-date.util';

describe('work-date.util (KST 달력일 도출)', () => {
  it('KST 정오는 그대로 그 날짜다', () => {
    // 2026-03-11 12:00 KST = 2026-03-11 03:00 UTC
    expect(deriveWorkDateString(new Date('2026-03-11T03:00:00.000Z'))).toBe('2026-03-11');
  });

  it('UTC로는 전날이지만 KST로는 다음날인 경계(자정 직후)를 올바르게 넘긴다', () => {
    // 2026-03-11 00:30 KST = 2026-03-10 15:30 UTC
    expect(deriveWorkDateString(new Date('2026-03-10T15:30:00.000Z'))).toBe('2026-03-11');
  });

  it('KST로 23:59는 아직 그날이다(다음날로 넘어가지 않는다)', () => {
    // 2026-03-11 23:59 KST = 2026-03-11 14:59 UTC
    expect(deriveWorkDateString(new Date('2026-03-11T14:59:00.000Z'))).toBe('2026-03-11');
  });

  it('deriveWorkDate는 그 달력일 자정 UTC로 표현된 Date를 반환한다(@db.Date 규약)', () => {
    const result = deriveWorkDate(new Date('2026-03-11T03:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-03-11T00:00:00.000Z');
  });
});
