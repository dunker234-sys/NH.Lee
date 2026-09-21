/**
 * 개시 데이터 이관 워크북의 시트 이름·행 타입. 파싱(ExcelJS 원본 →
 * ParsedWorkbook, DB 조회 없음)과 검증(ParsedWorkbook + DB → Resolved*,
 * 행단위 오류)이 이 타입들을 공유한다.
 */

export const MIGRATION_SHEET_NAMES = {
  LEAVE_BALANCE: '연차잔액',
  PROMOTION_LOG: '연차촉진이력',
  ATTENDANCE_MONTHLY: '마감월집계',
  ATTENDANCE_DAILY: '마감월일별상세(선택)',
  SHIFT_TEMPLATE: '교대패턴',
  SCHEDULE: '확정스케줄',
  RECONCILIATION: '수기집계대사',
} as const;

export interface RowError {
  sheet: string;
  rowNumber: number;
  employeeNo?: string;
  message: string;
}

// ---- 파싱 결과(원시 문자열, DB 조회 전) ----

export interface ParsedLeaveBalanceRow {
  rowNumber: number;
  employeeNo: string;
  leaveTypeCode: string;
  referencePeriod: string;
  effectiveDate: string;
  expiryDate: string;
  grantedDays: number;
  usedDays: number;
  carriedOverDays: number;
  expiredDays: number;
  note: string;
}

export interface ParsedPromotionLogRow {
  rowNumber: number;
  employeeNo: string;
  step: string;
  noticeDate: string;
  dueDate: string;
  method: string;
  sentAt: string;
  receivedAt: string;
  requirementMet: string;
  responseContent: string;
}

export interface ParsedAttendanceMonthlyRow {
  rowNumber: number;
  employeeNo: string;
  yearMonth: string;
  scheduledWorkMinutes: number;
  actualWorkMinutes: number;
  approvedOvertimeMinutes: number;
  unapprovedOvertimeMinutes: number;
  nightWorkMinutes: number;
  holidayWorkMinutesNormal: number;
  holidayWorkMinutesExcess: number;
  paidLeaveMinutes: number;
  absenceDays: number;
}

export interface ParsedAttendanceDailyRow {
  rowNumber: number;
  employeeNo: string;
  workDate: string;
  scheduledWorkMinutes: number;
  actualWorkMinutes: number;
  approvedOvertimeMinutes: number;
  unapprovedOvertimeMinutes: number;
  nightWorkMinutes: number;
  holidayWorkMinutesNormal: number;
  holidayWorkMinutesExcess: number;
  paidLeaveMinutes: number;
  isAbsence: string;
}

export interface ParsedShiftTemplateRow {
  rowNumber: number;
  name: string;
  startTime: string;
  endTime: string;
  breakStartTime: string;
  breakEndTime: string;
  crossesMidnight: string;
  applicableWeekdays: string;
}

export interface ParsedScheduleRow {
  rowNumber: number;
  employeeNo: string;
  workDate: string;
  shiftTemplateName: string;
  breakMinutes: number;
}

export interface ParsedReconciliationRow {
  rowNumber: number;
  employeeNo: string;
  metric: string;
  manualValue: number;
}

export interface ParsedWorkbook {
  leaveBalance: ParsedLeaveBalanceRow[];
  promotionLog: ParsedPromotionLogRow[];
  attendanceMonthly: ParsedAttendanceMonthlyRow[];
  attendanceDaily: ParsedAttendanceDailyRow[];
  shiftTemplate: ParsedShiftTemplateRow[];
  schedule: ParsedScheduleRow[];
  reconciliation: ParsedReconciliationRow[];
}

// ---- 검증 통과 후 해석된 행(DB 자연키 → id로 치환 완료) ----

export interface ResolvedLeaveBalanceRow {
  employeeId: string;
  employeeNo: string;
  leaveTypeId: string;
  leaveCategory: string;
  referencePeriod: string;
  effectiveDate: string;
  expiryDate: string;
  grantedDays: number;
  usedDays: number;
  carriedOverDays: number;
  expiredDays: number;
  note: string;
}

// procedureType은 항상 ARTICLE_61_1이다 — leave-promotion-compliance.service.ts가
// basis.reasonCode==='MONTHLY_ACCRUAL'이 아닌 이관 데이터를 의도적으로
// §61①로 기본 판정하기 때문에(그 파일 주석 참고), 이관 촉진이력을
// ARTICLE_61_2로 넣어봐야 실제 판정 로직이 절대 그 절차로 읽지 않는다.
export interface ResolvedPromotionLogRow {
  employeeId: string;
  step: 'FIRST_NOTICE' | 'SECOND_NOTICE';
  noticeDate: string;
  dueDate: string;
  method: 'WRITTEN_PAPER' | 'ELECTRONIC_DOCUMENT';
  sentAt: string | null;
  receivedAt: string | null;
  requirementMet: boolean;
  responseContent: string | null;
}

export interface ResolvedAttendanceMonthlyRow {
  employeeId: string;
  yearMonth: string;
  totals: {
    scheduledWorkMinutes: number;
    actualWorkMinutes: number;
    approvedOvertimeMinutes: number;
    unapprovedOvertimeMinutes: number;
    nightWorkMinutes: number;
    holidayWorkMinutesNormal: number;
    holidayWorkMinutesExcess: number;
    paidLeaveMinutes: number;
    absenceDays: number;
  };
}

export interface ResolvedAttendanceDailyRow {
  employeeId: string;
  siteId: string;
  workDate: string;
  scheduledWorkMinutes: number;
  actualWorkMinutes: number;
  approvedOvertimeMinutes: number;
  unapprovedOvertimeMinutes: number;
  nightWorkMinutes: number;
  holidayWorkMinutesNormal: number;
  holidayWorkMinutesExcess: number;
  paidLeaveMinutes: number;
  isAbsence: boolean;
}

export interface ResolvedShiftTemplateRow {
  name: string;
  startTime: string;
  endTime: string;
  breakStartTime: string | null;
  breakEndTime: string | null;
  crossesMidnight: boolean;
  applicableWeekdays: number[];
}

export interface ResolvedScheduleRow {
  employeeId: string;
  workDate: string;
  shiftTemplateName: string;
  breakMinutes: number;
}

export interface ResolvedReconciliationRow {
  employeeId: string;
  metric: 'ANNUAL_LEAVE_REMAINING_DAYS' | 'ATTENDANCE_MONTHLY_ACTUAL_MINUTES';
  manualValue: number;
}

export interface ResolvedMigrationPayload {
  siteId: string;
  cutoverDate: string;
  leaveBalance: ResolvedLeaveBalanceRow[];
  promotionLog: ResolvedPromotionLogRow[];
  attendanceMonthly: ResolvedAttendanceMonthlyRow[];
  attendanceDaily: ResolvedAttendanceDailyRow[];
  shiftTemplate: ResolvedShiftTemplateRow[];
  schedule: ResolvedScheduleRow[];
  reconciliation: ResolvedReconciliationRow[];
}
