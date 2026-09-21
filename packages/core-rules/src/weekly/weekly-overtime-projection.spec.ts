import { PolicyConfig } from '../types/policy-config';
import { WeeklyAlertThresholdPolicy } from './weekly-alert-stage';
import { projectWeeklyOvertime } from './weekly-overtime-projection';

const policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes' | 'weeklyOvertimeCapMinutes'> & WeeklyAlertThresholdPolicy = {
  weeklyStatutoryLimitMinutes: 2400,
  weeklyOvertimeCapMinutes: 720,
  attentionAbsoluteMinutes: 2700,
  attentionRelativeRatio: 0.7,
  warningAbsoluteMinutes: 2880,
  warningRelativeRatio: 0.85,
  dangerAbsoluteMinutes: 3000,
  dangerRelativeRatio: 0.95,
};

describe('projectWeeklyOvertime — 요구사항서 4.4③ 예측 알림', () => {
  it('이미 지난 실적 + 남은 계획근태 합산이 한도를 넘으면 예측 위반으로 표시한다', () => {
    const result = projectWeeklyOvertime({
      actualDailyTotals: [
        { date: 'mon', totalWorkMinutes: 600 },
        { date: 'tue', totalWorkMinutes: 600 },
        { date: 'wed', totalWorkMinutes: 600 },
      ],
      remainingScheduledDailyTotals: [
        { date: 'thu', totalWorkMinutes: 660 },
        { date: 'fri', totalWorkMinutes: 660 },
      ],
      contractedWeeklyMinutes: 2400,
      policy,
    });
    // 600*3 + 660*2 = 3120 = 52h → 40h초과분 12h → 위반 아님(경계, ==12h는 초과 아님)
    expect(result.projectedTotalMinutes).toBe(3120);
    expect(result.projectedExcessOver40Minutes).toBe(720);
    expect(result.projectedViolation).toBe(false);
    expect(result.projectedStage).toBe('DANGER');
    expect(result.isProjection).toBe(true);
  });

  it('남은 계획을 1분만 늘려도 예측 위반(EXCEEDED)으로 전환된다', () => {
    const result = projectWeeklyOvertime({
      actualDailyTotals: [
        { date: 'mon', totalWorkMinutes: 600 },
        { date: 'tue', totalWorkMinutes: 600 },
        { date: 'wed', totalWorkMinutes: 600 },
      ],
      remainingScheduledDailyTotals: [
        { date: 'thu', totalWorkMinutes: 660 },
        { date: 'fri', totalWorkMinutes: 661 },
      ],
      contractedWeeklyMinutes: 2400,
      policy,
    });
    expect(result.projectedExcessOver40Minutes).toBe(721);
    expect(result.projectedViolation).toBe(true);
    expect(result.projectedStage).toBe('EXCEEDED');
  });

  it('남은 계획이 없으면 실적만으로 예측한다(현재 상태와 동일)', () => {
    const result = projectWeeklyOvertime({
      actualDailyTotals: [{ date: 'mon', totalWorkMinutes: 500 }],
      remainingScheduledDailyTotals: [],
      contractedWeeklyMinutes: 2400,
      policy,
    });
    expect(result.projectedTotalMinutes).toBe(500);
    expect(result.projectedStage).toBe('NONE');
  });
});
