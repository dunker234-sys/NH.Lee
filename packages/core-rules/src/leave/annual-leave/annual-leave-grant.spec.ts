import { AnnualLeavePolicyConfig } from '../../types/policy-config';
import { calculateAnnualLeaveGrant } from './annual-leave-grant';
import { MonthlyAttendanceRecord } from './monthly-accrual';

const policy: AnnualLeavePolicyConfig = {
  annualLeaveBaseDays: 15,
  annualLeaveMaxCapDays: 25,
  annualLeaveSeniorityIntervalYears: 2,
  annualLeaveMonthlyAccrualMaxMonths: 11,
  annualLeaveAttendanceRateThresholdPercent: 80,
  ultraPartTimeWeeklyThresholdMinutes: 900,
};

function perfectMonths(count: number): MonthlyAttendanceRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    monthStartDate: `2025-${String(i + 1).padStart(2, '0')}-01`,
    fullyAttended: true,
  }));
}

describe('calculateAnnualLeaveGrant — 합성 진입점(요구사항서4.3 §1 완료조건1 직접 증명)', () => {
  it('★ 1년 기간제(정확히 365일 근무 후 종료): 11개월 개근 → 11일. 15일은 발생하지 않는다', () => {
    const result = calculateAnnualLeaveGrant(
      {
        leaveApplicable: true,
        fourWeekAverageWeeklyScheduledMinutes: 2400,
        yearsOfService: 0,
        monthly: { months: perfectMonths(11) },
        firstYearEndDate: '2026-08-31',
      },
      policy,
    );
    expect(result.grantedDays).toBe(11);
    expect(result.grantedDays).not.toBe(15);
    expect(result.basis.reasonCode).toBe('MONTHLY_ACCRUAL');
    expect(result.basis.fullYearResult).toBeUndefined();
  });

  it('1년 이상 근속 + 80% 이상 출근 + 계속 근로 → 15일(가산 없음, 1년차)', () => {
    const result = calculateAnnualLeaveGrant(
      {
        leaveApplicable: true,
        fourWeekAverageWeeklyScheduledMinutes: 2400,
        yearsOfService: 1,
        fullYear: {
          attendance: { totalScheduledWorkdays: 250, absentWorkdays: 0, deemedAttendanceWorkdays: 0 },
          continuesEmploymentAfterPeriod: true,
        },
      },
      policy,
    );
    expect(result.grantedDays).toBe(15);
    expect(result.basis.reasonCode).toBe('FULL_YEAR_GRANT');
  });

  it('3년차는 16일(15+1), 5년차는 17일(15+2)', () => {
    const base = {
      leaveApplicable: true,
      fourWeekAverageWeeklyScheduledMinutes: 2400,
      fullYear: {
        attendance: { totalScheduledWorkdays: 250, absentWorkdays: 0, deemedAttendanceWorkdays: 0 },
        continuesEmploymentAfterPeriod: true,
      },
    };
    expect(calculateAnnualLeaveGrant({ ...base, yearsOfService: 3 }, policy).grantedDays).toBe(16);
    expect(calculateAnnualLeaveGrant({ ...base, yearsOfService: 5 }, policy).grantedDays).toBe(17);
  });

  it('가산을 포함해도 25일을 넘지 않는다(21년차 이상 캡)', () => {
    const result = calculateAnnualLeaveGrant(
      {
        leaveApplicable: true,
        fourWeekAverageWeeklyScheduledMinutes: 2400,
        yearsOfService: 23,
        fullYear: {
          attendance: { totalScheduledWorkdays: 250, absentWorkdays: 0, deemedAttendanceWorkdays: 0 },
          continuesEmploymentAfterPeriod: true,
        },
      },
      policy,
    );
    expect(result.grantedDays).toBe(25);
    expect(result.basis.cappedAt).toBe(25);
  });

  it('사업장이 연차 미적용(leaveApplicable:false)이면 출근율과 무관하게 0일이다', () => {
    const result = calculateAnnualLeaveGrant(
      {
        leaveApplicable: false,
        fourWeekAverageWeeklyScheduledMinutes: 2400,
        yearsOfService: 5,
        fullYear: {
          attendance: { totalScheduledWorkdays: 250, absentWorkdays: 0, deemedAttendanceWorkdays: 0 },
          continuesEmploymentAfterPeriod: true,
        },
      },
      policy,
    );
    expect(result.grantedDays).toBe(0);
    expect(result.basis.reasonCode).toBe('NOT_APPLICABLE_UNDER_FIVE');
  });

  it('yearsOfService<1인데 monthly 입력이 없으면 방어적으로 예외를 던진다', () => {
    expect(() =>
      calculateAnnualLeaveGrant(
        { leaveApplicable: true, fourWeekAverageWeeklyScheduledMinutes: 2400, yearsOfService: 0 },
        policy,
      ),
    ).toThrow('monthly와 firstYearEndDate가 필수');
  });

  it('yearsOfService>=1인데 fullYear 입력이 없으면 방어적으로 예외를 던진다', () => {
    expect(() =>
      calculateAnnualLeaveGrant(
        { leaveApplicable: true, fourWeekAverageWeeklyScheduledMinutes: 2400, yearsOfService: 1 },
        policy,
      ),
    ).toThrow('fullYear가 필수');
  });

  it('4주 평균 소정근로 15시간 미만(초단시간)이면 0일이다(§18③)', () => {
    const result = calculateAnnualLeaveGrant(
      {
        leaveApplicable: true,
        fourWeekAverageWeeklyScheduledMinutes: 600,
        yearsOfService: 5,
        fullYear: {
          attendance: { totalScheduledWorkdays: 250, absentWorkdays: 0, deemedAttendanceWorkdays: 0 },
          continuesEmploymentAfterPeriod: true,
        },
      },
      policy,
    );
    expect(result.grantedDays).toBe(0);
    expect(result.basis.reasonCode).toBe('NOT_APPLICABLE_ULTRA_PART_TIME');
  });
});
