import { MinuteSegment } from '../time/segments';

export type PunchType = 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN';

export interface PunchEvent {
  type: PunchType;
  /** ISO instant (UTC). work_date 파생에 쓰지 않는다 — 호출자가 이미 산출해 넘긴다. */
  recordedAt: string;
}

/** 근무가 걸치는 역일(달력일)별 휴일 판정. 시업일(work_date) 귀속과는 별개 축이다. */
export interface HolidayStatusEntry {
  /** "YYYY-MM-DD", KST 기준 달력일 */
  calendarDate: string;
  isHoliday: boolean;
}

/** 시나리오5: 관리자의 "근로 미제공" 판정. judged=true인 경우에만 실제 계산에서 제외된다. */
export interface WorkNotProvidedJudgment {
  judged: boolean;
  reason?: string;
  judgedAt?: string;
  judgedBy?: string;
}

export interface DailyCalculationInput {
  /** KST date "YYYY-MM-DD" — 호출자가 산출해 주입(시업일 귀속). 엔진은 재계산하지 않는다. */
  workDate: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  /** 계획 휴게. 실제 타각이 있으면 완전히 무시된다 — 자동공제 근거로 쓰지 않는다. */
  scheduledBreakSegments: MinuteSegment[];
  /** 정렬되지 않았을 수 있음 — 엔진이 정렬한다. */
  punches: PunchEvent[];
  /** "휴게 미부여" 근로자 신고 */
  breakNotGrantedReported: boolean;
  /** 근무가 걸치는 1~2개 역일의 휴일 여부 */
  holidayStatusByCalendarDate: HolidayStatusEntry[];
  /** 근로일 시점 이력값 — 호출자가 site_headcount_history에서 조회해 주입 */
  isUnderFiveEmployees: boolean;
  /** null = 신청조차 없음(미승인). true = 사전/사후 승인됨. */
  overtimeApproved: boolean | null;
  workNotProvidedJudgment: WorkNotProvidedJudgment | null;
  /** 단시간 근로자의 소정근로시간(분). null이면 시나리오33 판정을 스킵한다. */
  contractedDailyWorkMinutes: number | null;
  /** 연차/반차 등으로 이미 확정된 유급휴가 시간(분). 근로시간 계산과 분리 합산. */
  paidLeaveMinutes: number;
}
