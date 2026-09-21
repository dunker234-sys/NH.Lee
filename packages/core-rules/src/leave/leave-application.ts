export type LeaveUnit = 'FULL' | 'HALF_AM' | 'HALF_PM' | 'QUARTER';
export type LeaveRequestStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

export interface LeaveApplicationInput {
  unit: LeaveUnit;
  /** 그 날의 소정근로시간(분) — 반차/반반차 환산 기준 */
  contractedDailyWorkMinutes: number;
  status: LeaveRequestStatus;
}

export interface LeaveApplicationResult {
  /** daily-attendance.ts의 DailyCalculationInput.paidLeaveMinutes로 그대로 넘긴다. */
  paidLeaveMinutes: number;
  /** 승인된 유급휴가로 확정됐는지 — 미등록(무단결근) 알림 대상에서 제외할지 판단(시나리오34). */
  confirmed: boolean;
  excludeFromNoShowAlert: boolean;
}

/** 정수 분 나눗셈만 쓴다(부동소수점 금지) — 0.5/0.25를 곱하지 않고 /2, /4로 나눈다. */
function fractionMinutes(totalMinutes: number, unit: LeaveUnit): number {
  switch (unit) {
    case 'FULL':
      return totalMinutes;
    case 'HALF_AM':
    case 'HALF_PM':
      return Math.floor(totalMinutes / 2);
    case 'QUARTER':
      return Math.floor(totalMinutes / 4);
  }
}

/**
 * 연차/반차 등 휴가 신청을 유급휴가 시간(분)으로 환산한다(시나리오34,35).
 * 승인된 건만 유급으로 확정한다 — 대기/반려는 0분이다.
 */
export function applyLeave(input: LeaveApplicationInput): LeaveApplicationResult {
  if (input.status !== 'APPROVED') {
    return { paidLeaveMinutes: 0, confirmed: false, excludeFromNoShowAlert: false };
  }

  return {
    paidLeaveMinutes: fractionMinutes(input.contractedDailyWorkMinutes, input.unit),
    confirmed: true,
    excludeFromNoShowAlert: true,
  };
}
