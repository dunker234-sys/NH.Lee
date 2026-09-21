import { calculateFullYearAnnualLeaveGrant } from './full-year-grant';

const policy = { annualLeaveBaseDays: 15, annualLeaveAttendanceRateThresholdPercent: 80 };

describe('calculateFullYearAnnualLeaveGrant — §60① + 대법원 2021.10.14. 2021다227100', () => {
  it('80% 이상 출근 + 계속 근로 시 15일 발생한다', () => {
    const result = calculateFullYearAnnualLeaveGrant(
      {
        attendance: { totalScheduledWorkdays: 250, absentWorkdays: 10, deemedAttendanceWorkdays: 0 },
        continuesEmploymentAfterPeriod: true,
      },
      policy,
    );
    expect(result.grantedDays).toBe(15);
    expect(result.reasonCode).toBe('GRANTED');
  });

  it('★ 대법 2021다227100: 정확히 1년만 근무하고 종료(기간제 만료)되면 80% 이상 개근이어도 0일이다 — 15일 미발생', () => {
    const result = calculateFullYearAnnualLeaveGrant(
      {
        attendance: { totalScheduledWorkdays: 250, absentWorkdays: 0, deemedAttendanceWorkdays: 0 },
        continuesEmploymentAfterPeriod: false,
      },
      policy,
    );
    expect(result.grantedDays).toBe(0);
    expect(result.grantedDays).not.toBe(15);
    expect(result.reasonCode).toBe('EMPLOYMENT_ENDED_AT_PERIOD_END');
  });

  it('80% 미만 출근이면 계속 근로해도 0일이다', () => {
    const result = calculateFullYearAnnualLeaveGrant(
      {
        attendance: { totalScheduledWorkdays: 100, absentWorkdays: 30, deemedAttendanceWorkdays: 0 },
        continuesEmploymentAfterPeriod: true,
      },
      policy,
    );
    expect(result.grantedDays).toBe(0);
    expect(result.reasonCode).toBe('BELOW_THRESHOLD');
  });
});
