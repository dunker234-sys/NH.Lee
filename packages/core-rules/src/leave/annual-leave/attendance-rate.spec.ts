import { computeAttendanceRate } from './attendance-rate';

const policy = { annualLeaveAttendanceRateThresholdPercent: 80 };

describe('computeAttendanceRate — §60① 출근율 산정', () => {
  it('정확히 80%면 임계값을 충족한다(경계값)', () => {
    const result = computeAttendanceRate(
      { totalScheduledWorkdays: 100, absentWorkdays: 20, deemedAttendanceWorkdays: 0 },
      policy,
    );
    expect(result.attendanceRatePercent).toBe(80);
    expect(result.meetsThreshold).toBe(true);
  });

  it('79.9%(정수 미만 경계)면 충족하지 못한다', () => {
    const result = computeAttendanceRate(
      { totalScheduledWorkdays: 1000, absentWorkdays: 201, deemedAttendanceWorkdays: 0 },
      policy,
    );
    expect(result.meetsThreshold).toBe(false);
  });

  it('§60⑥ 출근간주 기간만큼 결근일수에서 상쇄되어 출근율이 올라간다', () => {
    // 결근 30일 중 20일이 육아휴직(출근간주) → 실질 결근 10일 → 90% 출근
    const withoutOffset = computeAttendanceRate(
      { totalScheduledWorkdays: 100, absentWorkdays: 30, deemedAttendanceWorkdays: 0 },
      policy,
    );
    const withOffset = computeAttendanceRate(
      { totalScheduledWorkdays: 100, absentWorkdays: 30, deemedAttendanceWorkdays: 20 },
      policy,
    );
    expect(withoutOffset.meetsThreshold).toBe(false);
    expect(withOffset.effectiveAbsentWorkdays).toBe(10);
    expect(withOffset.attendanceRatePercent).toBe(90);
    expect(withOffset.meetsThreshold).toBe(true);
  });

  it('소정근로일이 0이면 0%로 처리하고 임계값을 충족하지 못한다(0으로 나누지 않는다)', () => {
    const result = computeAttendanceRate(
      { totalScheduledWorkdays: 0, absentWorkdays: 0, deemedAttendanceWorkdays: 0 },
      policy,
    );
    expect(result.attendanceRatePercent).toBe(0);
    expect(result.meetsThreshold).toBe(false);
  });

  it('출근간주 일수가 결근일수보다 많아도 실질 결근은 0에서 음수로 내려가지 않는다', () => {
    const result = computeAttendanceRate(
      { totalScheduledWorkdays: 100, absentWorkdays: 5, deemedAttendanceWorkdays: 20 },
      policy,
    );
    expect(result.effectiveAbsentWorkdays).toBe(0);
    expect(result.attendanceRatePercent).toBe(100);
  });
});
