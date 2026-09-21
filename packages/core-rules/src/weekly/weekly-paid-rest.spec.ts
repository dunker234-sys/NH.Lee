import { PolicyConfig } from '../types/policy-config';
import { determineWeeklyPaidRest } from './weekly-paid-rest';

const policy: Pick<PolicyConfig, 'ultraPartTimeWeeklyThresholdMinutes'> = {
  ultraPartTimeWeeklyThresholdMinutes: 900, // 15h
};

describe('determineWeeklyPaidRest — 시나리오18 (주휴)', () => {
  it('소정근로일 전부 개근하면 주휴가 발생한다', () => {
    const result = determineWeeklyPaidRest({
      scheduledWorkdays: [
        { date: 'mon', fullyAttended: true },
        { date: 'tue', fullyAttended: true },
      ],
      fourWeekAverageWeeklyScheduledMinutes: 2400,
      policy,
    });
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('FULL_ATTENDANCE');
  });

  it('하루라도 결근하면 주휴가 발생하지 않는다', () => {
    const result = determineWeeklyPaidRest({
      scheduledWorkdays: [
        { date: 'mon', fullyAttended: true },
        { date: 'tue', fullyAttended: false },
      ],
      fourWeekAverageWeeklyScheduledMinutes: 2400,
      policy,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('INCOMPLETE_ATTENDANCE');
  });

  it('4주 평균 1주 소정근로시간이 15시간 미만인 초단시간 근로자는 개근해도 미적용된다(§18③)', () => {
    const result = determineWeeklyPaidRest({
      scheduledWorkdays: [{ date: 'mon', fullyAttended: true }],
      fourWeekAverageWeeklyScheduledMinutes: 600, // 10h
      policy,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('ULTRA_PART_TIME_EXEMPT');
  });
});
