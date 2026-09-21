import { suggestScheduleAdjustments } from './schedule-adjustment-suggestion';

describe('suggestScheduleAdjustments — 요구사항서 4.4③ 조정 가능한 스케줄 후보 제시', () => {
  it('가장 긴 근무일부터 줄여 필요한 만큼 해소한다', () => {
    const result = suggestScheduleAdjustments(
      [
        { date: 'thu', scheduledMinutes: 480 },
        { date: 'fri', scheduledMinutes: 600 },
      ],
      120,
    );
    const fri = result.candidates.find((c) => c.date === 'fri')!;
    const thu = result.candidates.find((c) => c.date === 'thu')!;
    expect(fri.reducedMinutes).toBe(120);
    expect(fri.suggestedMinutes).toBe(480);
    expect(thu.reducedMinutes).toBe(0);
    expect(thu.suggestedMinutes).toBe(480);
    expect(result.totalReducedMinutes).toBe(120);
    expect(result.fullyResolved).toBe(true);
  });

  it('한 날짜로 부족하면 다음으로 긴 날짜까지 이어서 줄인다', () => {
    const result = suggestScheduleAdjustments(
      [
        { date: 'thu', scheduledMinutes: 480 },
        { date: 'fri', scheduledMinutes: 480 },
      ],
      600,
    );
    expect(result.totalReducedMinutes).toBe(600);
    expect(result.fullyResolved).toBe(true);
    const total = result.candidates.reduce((s, c) => s + c.suggestedMinutes, 0);
    expect(total).toBe(960 - 600);
  });

  it('남은 계획을 전부 줄여도 부족하면 fullyResolved=false — 자동으로 0 미만을 만들지 않는다', () => {
    const result = suggestScheduleAdjustments([{ date: 'fri', scheduledMinutes: 480 }], 600);
    expect(result.candidates[0].suggestedMinutes).toBe(0);
    expect(result.candidates[0].reducedMinutes).toBe(480);
    expect(result.totalReducedMinutes).toBe(480);
    expect(result.fullyResolved).toBe(false);
  });

  it('reduceByMinutes가 0이면 아무 것도 줄이지 않는다', () => {
    const result = suggestScheduleAdjustments([{ date: 'fri', scheduledMinutes: 480 }], 0);
    expect(result.candidates[0].reducedMinutes).toBe(0);
    expect(result.fullyResolved).toBe(true);
  });
});
