import { AnnualLeavePolicyConfig } from '../../types/policy-config';
import { AttendanceRateInput, computeAttendanceRate } from './attendance-rate';

export interface FullYearGrantInput {
  attendance: AttendanceRateInput;
  /**
   * §60①은 "1년의 근로를 마친 다음 날" 발생한다 — 그 다음 날이 오기 전에
   * 근로관계가 종료(퇴사, 정확히 1년짜리 기간제 계약 만료 등)되면
   * 발생하지 않는다. 대법원 2021.10.14. 2021다227100의 핵심 게이트.
   */
  continuesEmploymentAfterPeriod: boolean;
}

export type FullYearGrantReasonCode = 'GRANTED' | 'BELOW_THRESHOLD' | 'EMPLOYMENT_ENDED_AT_PERIOD_END';

export interface FullYearGrantResult {
  grantedDays: number;
  attendanceRatePercent: number;
  meetsThreshold: boolean;
  reasonCode: FullYearGrantReasonCode;
}

export function calculateFullYearAnnualLeaveGrant(
  input: FullYearGrantInput,
  policy: Pick<AnnualLeavePolicyConfig, 'annualLeaveBaseDays' | 'annualLeaveAttendanceRateThresholdPercent'>,
): FullYearGrantResult {
  const attendanceResult = computeAttendanceRate(input.attendance, policy);

  if (!input.continuesEmploymentAfterPeriod) {
    return {
      grantedDays: 0,
      attendanceRatePercent: attendanceResult.attendanceRatePercent,
      meetsThreshold: attendanceResult.meetsThreshold,
      reasonCode: 'EMPLOYMENT_ENDED_AT_PERIOD_END',
    };
  }

  if (!attendanceResult.meetsThreshold) {
    return {
      grantedDays: 0,
      attendanceRatePercent: attendanceResult.attendanceRatePercent,
      meetsThreshold: false,
      reasonCode: 'BELOW_THRESHOLD',
    };
  }

  return {
    grantedDays: policy.annualLeaveBaseDays,
    attendanceRatePercent: attendanceResult.attendanceRatePercent,
    meetsThreshold: true,
    reasonCode: 'GRANTED',
  };
}
