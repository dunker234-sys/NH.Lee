// PROVISIONAL — STEP6/7/8/9 착수 시 실제 백엔드 DTO로 교체한다. 아직 실제
// 백엔드가 없는 타입이라 packages/shared-types로 승격하지 않는다(계획서
// §2.2 — 승격하면 나중에 실제 DTO와 드리프트할 위험이 있다).
//
// 화면은 이 인터페이스 타입만 참조하고, mock↔real 배선은 index.ts 한 곳에서만
// 결정한다(계획서 §2.3) — STEP6-9가 실제 백엔드를 만들면 *.real.ts를 이
// 인터페이스대로 구현해 index.ts의 한 줄만 바꾸면 되고 화면은 손대지 않는다.

export interface ApiResult<T> {
  data: T;
  /** dev 모드 배너 전용 — 운영 빌드에서는 사용자에게 노출하지 않는다. */
  source: 'REAL' | 'MOCK';
}

// ---- 내 근태(STEP3 계산엔진 결과 + STEP8 정정, 읽기 API가 아직 없음) -----

export type AttendanceDayStatus = 'NORMAL' | 'LATE' | 'EARLY_LEAVE' | 'ABSENT' | 'HOLIDAY_WORK' | 'NO_SCHEDULE';

export interface AttendanceDaySummary {
  date: string; // YYYY-MM-DD
  status: AttendanceDayStatus;
  workedMinutes: number;
}

export interface AttendanceDayDetailData extends AttendanceDaySummary {
  punches: { type: string; recordedAt: string; verificationLevel: string }[];
  note: string | null;
}

export interface AttendanceApi {
  getMonthSummary(yearMonth: string): Promise<ApiResult<AttendanceDaySummary[]>>;
  getDayDetail(date: string): Promise<ApiResult<AttendanceDayDetailData>>;
}

// ---- 스케줄(STEP6) ----------------------------------------------------

export interface ScheduleDay {
  date: string; // YYYY-MM-DD
  shiftName: string | null; // 예: '조식조', '중식조' — 근무 없는 날은 null
  plannedStartTime: string | null; // HH:mm
  plannedEndTime: string | null;
}

export interface MonthSchedule {
  yearMonth: string; // YYYY-MM
  days: ScheduleDay[];
}

export interface YearScheduleSummary {
  year: number;
  totalScheduledDays: number;
  byMonth: { month: number; scheduledDays: number }[];
}

export interface ScheduleApi {
  getMonthSchedule(yearMonth: string): Promise<ApiResult<MonthSchedule>>;
  getYearSchedule(year: number): Promise<ApiResult<YearScheduleSummary>>;
}

// ---- 휴가(STEP7) --------------------------------------------------------

export interface LeaveBalanceBreakdownItem {
  label: string; // 예: '입사 1년 미만 월단위 발생'
  days: number;
}

export interface LeaveBalance {
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  breakdown: LeaveBalanceBreakdownItem[]; // core-rules의 breakdown 관례를 목업에서도 그대로 흉내낸다
}

export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LeaveRequest {
  id: string;
  leaveType: 'ANNUAL' | 'HALF_DAY' | 'QUARTER_DAY';
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveRequestStatus;
  requestedAt: string;
}

export interface LeaveRequestInput {
  leaveType: LeaveRequest['leaveType'];
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface LeaveApi {
  getBalance(): Promise<ApiResult<LeaveBalance>>;
  listRequests(): Promise<ApiResult<LeaveRequest[]>>;
  submitRequest(input: LeaveRequestInput): Promise<ApiResult<LeaveRequest>>;
}

// ---- 신청함(정정·휴가·연장·외근 통합, STEP6.5/7/8) -----------------------

export type ApplicationKind = 'CORRECTION' | 'LEAVE' | 'OVERTIME' | 'DISPATCH';
export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApplicationRecord {
  id: string;
  kind: ApplicationKind;
  summary: string; // 예: '2026-08-20 지각 정정 신청'
  status: ApplicationStatus;
  submittedAt: string;
  approvalStage?: string; // 예: '1차(사업장) 승인 대기'
}

export interface ApplicationsApi {
  listApplications(): Promise<ApiResult<ApplicationRecord[]>>;
  submitCorrection(date: string, reason: string): Promise<ApiResult<ApplicationRecord>>;
}

// ---- 52시간 준법 게이지(STEP9, 홈 화면이 소비) --------------------------

export interface WeeklyComplianceGauge {
  weekStart: string; // YYYY-MM-DD, 월요일
  totalWorkMinutes: number;
  limitMinutes: number; // policy_config의 52시간 한도 — 목업에서는 3120(52*60)로 고정
  workedTodayMinutes: number;
  todayShiftLabel: string | null;
}

export interface ComplianceApi {
  getWeeklyGauge(weekStart: string): Promise<ApiResult<WeeklyComplianceGauge>>;
}
