import { AnnualLeavePolicyConfig } from '../../types/policy-config';

export interface AttendanceRateInput {
  totalScheduledWorkdays: number;
  absentWorkdays: number;
  /** §60⑥ 출근 간주 기간(업무상 부상질병휴업/출산전후휴가/육아휴직/육아기·임신기
   * 단축근로)에 속한 소정근로일수 — 결근일수에서 방어적으로 상쇄한다. */
  deemedAttendanceWorkdays: number;
}

export interface AttendanceRateResult {
  /** 표시용 백분율(반올림). meetsThreshold 판정에는 쓰지 않는다. */
  attendanceRatePercent: number;
  meetsThreshold: boolean;
  effectiveAbsentWorkdays: number;
}

/**
 * §60① 출근율 산정. 출근간주 기간을 결근으로 처리하면 연차가 과소
 * 산정되므로(요구사항서4.3 §1), effectiveAbsentWorkdays로 먼저 상쇄한
 * 뒤 비율을 계산한다. meetsThreshold는 정수 교차곱 비교로 판정해
 * 부동소수점 반올림에 의한 경계 오차를 만들지 않는다.
 */
export function computeAttendanceRate(
  input: AttendanceRateInput,
  policy: Pick<AnnualLeavePolicyConfig, 'annualLeaveAttendanceRateThresholdPercent'>,
): AttendanceRateResult {
  const effectiveAbsentWorkdays = Math.max(0, input.absentWorkdays - input.deemedAttendanceWorkdays);
  const attendedWorkdays = Math.max(0, input.totalScheduledWorkdays - effectiveAbsentWorkdays);

  const attendanceRatePercent =
    input.totalScheduledWorkdays > 0 ? Math.round((attendedWorkdays / input.totalScheduledWorkdays) * 100) : 0;

  const meetsThreshold =
    input.totalScheduledWorkdays > 0 &&
    attendedWorkdays * 100 >= policy.annualLeaveAttendanceRateThresholdPercent * input.totalScheduledWorkdays;

  return { attendanceRatePercent, meetsThreshold, effectiveAbsentWorkdays };
}
