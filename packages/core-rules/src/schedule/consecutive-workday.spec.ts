import { checkConsecutiveWorkdayLimit } from './consecutive-workday';

describe('checkConsecutiveWorkdayLimit', () => {
  it('연속 근무일수가 정확히 상한이면 위반이 아니다', () => {
    const workDates = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'];
    const result = checkConsecutiveWorkdayLimit({ workDates, maxConsecutiveDays: 6 });
    expect(result.violated).toBe(false);
    expect(result.runs).toHaveLength(0);
  });

  it('연속 근무일수가 상한을 1일 초과하면 위반이고 구간이 보고된다', () => {
    const workDates = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];
    const result = checkConsecutiveWorkdayLimit({ workDates, maxConsecutiveDays: 6 });
    expect(result.violated).toBe(true);
    expect(result.runs).toEqual([{ startDate: '2026-08-01', endDate: '2026-08-07', lengthDays: 7 }]);
    expect(result.reasons[0]).toContain('2026-08-01');
    expect(result.reasons[0]).toContain('2026-08-07');
  });

  it('중간에 휴무일이 있으면 연속 구간이 끊긴다(초과 없음)', () => {
    const workDates = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-05', '2026-08-06', '2026-08-07'];
    const result = checkConsecutiveWorkdayLimit({ workDates, maxConsecutiveDays: 6 });
    expect(result.violated).toBe(false);
  });

  it('별개의 초과 구간이 여러 개면 모두 보고된다', () => {
    const workDates = [
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', // 4일 구간(상한3, 초과)
      '2026-08-06',
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', // 또 다른 4일 구간
    ];
    const result = checkConsecutiveWorkdayLimit({ workDates, maxConsecutiveDays: 3 });
    expect(result.violated).toBe(true);
    expect(result.runs).toHaveLength(2);
    expect(result.runs[0]).toEqual({ startDate: '2026-08-01', endDate: '2026-08-04', lengthDays: 4 });
    expect(result.runs[1]).toEqual({ startDate: '2026-08-10', endDate: '2026-08-13', lengthDays: 4 });
  });

  it('월 경계를 넘는 연속 구간도 하나의 run으로 인식된다', () => {
    const workDates = ['2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'];
    const result = checkConsecutiveWorkdayLimit({ workDates, maxConsecutiveDays: 4 });
    expect(result.violated).toBe(true);
    expect(result.runs).toEqual([{ startDate: '2026-08-29', endDate: '2026-09-02', lengthDays: 5 }]);
  });

  it('빈 배열이면 위반이 아니다', () => {
    const result = checkConsecutiveWorkdayLimit({ workDates: [], maxConsecutiveDays: 6 });
    expect(result.violated).toBe(false);
    expect(result.runs).toHaveLength(0);
  });
});
