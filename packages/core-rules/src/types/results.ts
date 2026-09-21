export type ReviewFlag = 'UNAPPROVED_ACTUAL' | 'BREAK_NOT_GRANTED' | 'BREAK_UNDER_PROVIDED' | 'BREAK_IN_MISSING';

export type PayBucket = 'REGULAR' | 'OVERTIME' | 'HOLIDAY_NORMAL' | 'HOLIDAY_EXCESS' | 'BREAK';
export type ApprovalStatus = 'APPROVED' | 'UNAPPROVED' | 'N_A';

/**
 * 급여 담당자가 "이 시간은 왜 이렇게 계산되었는가"에 답할 수 있는 산출 근거.
 * payBucket(지급배율 버킷)과 approvalStatus(승인 축)는 서로 독립이다 —
 * 승인 여부는 rateMultiplier에 절대 영향을 주지 않는다.
 */
export interface BreakdownEntry {
  startAt: string;
  endAt: string;
  minutes: number;
  flags: { overtime: boolean; night: boolean };
  payBucket: PayBucket;
  approvalStatus: ApprovalStatus;
  /** 지급배율(가산율의 합이 아니라 기본 1.0을 포함한 최종 배율). 1.0/1.5/2.0/2.5 등. */
  rateMultiplier: number;
  note: string;
}

interface DailyAttendancePending {
  status: 'PENDING';
  reason: 'CLOCK_OUT_MISSING';
  workDate: string;
  partial: {
    scheduledWorkMinutes: number;
    lastPunchAt: string | null;
  };
}

interface DailyAttendanceCalculated {
  status: 'CALCULATED';
  workDate: string;
  scheduledWorkMinutes: number;
  actualWorkMinutes: number;
  approvedOvertimeMinutes: number;
  /** 시나리오 3,4,22 — 이 값을 0으로 만드는 코드 경로는
   * workNotProvidedJudgment.judged===true 분기 하나만 존재해야 한다. */
  unapprovedOvertimeMinutes: number;
  /** 시나리오33 — 단시간 근로자의 소정 초과분(연장 아님). attendance_daily에
   * 대응 컬럼이 없어 이 결과 객체와 breakdown에만 존재한다(RULES.md 갭 기록). */
  scheduledExcessMinutes: number;
  nightWorkMinutes: number;
  holidayWorkMinutesNormal: number;
  holidayWorkMinutesExcess: number;
  breakMinutes: number;
  latenessMinutes: number;
  earlyLeaveMinutes: number;
  isAbsence: boolean;
  paidLeaveMinutes: number;
  reviewFlags: ReviewFlag[];
  warnings: string[];
  breakdown: BreakdownEntry[];
}

export type DailyAttendanceResult = DailyAttendancePending | DailyAttendanceCalculated;
