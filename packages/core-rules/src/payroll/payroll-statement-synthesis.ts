import { PayrollLayoutType } from './payroll-layout';

/** attendance_daily 1행에 해당하는, 이미 계산이 끝난 값만 담는다 — 새 법령 판단 없음. */
export interface PayrollStatementSourceDay {
  workDate: string;
  scheduledWorkMinutes: number;
  approvedOvertimeMinutes: number;
  unapprovedOvertimeMinutes: number;
  nightWorkMinutes: number;
  holidayWorkMinutesNormal: number;
  holidayWorkMinutesExcess: number;
  latenessMinutes: number;
  earlyLeaveMinutes: number;
  isAbsence: boolean;
}

/** 승인된 LeaveRequest × LeaveType.paid를 호출자가 미리 조인해 넘긴다. */
export interface PayrollStatementLeaveDay {
  date: string;
  paid: boolean;
  deductedDays: number;
}

/** determineWeeklyPaidRest() + calculateWeeklyPaidRestMinutes() 결과를 주 단위로 넘긴다. */
export interface PayrollStatementWeek {
  weekStartDate: string;
  eligible: boolean;
  minutes: number;
}

export interface PayrollStatementLine {
  /** DAILY 레이아웃일 때만 채워진다. MONTHLY는 undefined(월 전체 1행). */
  workDate?: string;
  scheduledWorkMinutes: number;
  approvedOvertimeMinutes: number;
  unapprovedOvertimeMinutes: number;
  nightWorkMinutes: number;
  holidayWorkMinutesNormal: number;
  holidayWorkMinutesExcess: number;
  absenceDays: number;
  latenessDays: number;
  earlyLeaveDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  weeklyPaidRestEligibleCount: number;
  weeklyPaidRestMinutes: number;
}

export interface SynthesizePayrollStatementInput {
  days: PayrollStatementSourceDay[];
  leaveDays: PayrollStatementLeaveDay[];
  weeklyPaidRest: PayrollStatementWeek[];
  layoutType: PayrollLayoutType;
}

export interface SynthesizePayrollStatementResult {
  lines: PayrollStatementLine[];
  breakdown: Array<Record<string, unknown>>;
}

function emptyLine(workDate?: string): PayrollStatementLine {
  return {
    workDate,
    scheduledWorkMinutes: 0,
    approvedOvertimeMinutes: 0,
    unapprovedOvertimeMinutes: 0,
    nightWorkMinutes: 0,
    holidayWorkMinutesNormal: 0,
    holidayWorkMinutesExcess: 0,
    absenceDays: 0,
    latenessDays: 0,
    earlyLeaveDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    weeklyPaidRestEligibleCount: 0,
    weeklyPaidRestMinutes: 0,
  };
}

function sumLeaveDays(leaveDays: PayrollStatementLeaveDay[], paid: boolean, date?: string): number {
  return leaveDays
    .filter((l) => l.paid === paid && (date === undefined || l.date === date))
    .reduce((sum, l) => sum + l.deductedDays, 0);
}

/**
 * 임금대장/임금명세서 항목 합성 — 이미 계산된 일/주 단위 결과(attendance_daily,
 * attendance_weekly, 승인된 LeaveRequest)를 집계만 한다(새 계산 없음). MONTHLY는
 * 월 전체 1행, DAILY(일용)는 일자별 N행으로 분기한다(STEP11).
 *
 * unapprovedOvertimeMinutes는 approvedOvertimeMinutes와 절대 합산·대체하지 않고
 * 끝까지 별도 컬럼으로 보존한다(CLAUDE.md 절대규칙2).
 */
export function synthesizePayrollStatement(input: SynthesizePayrollStatementInput): SynthesizePayrollStatementResult {
  if (input.layoutType === 'DAILY') {
    const sortedDays = [...input.days].sort((a, b) => a.workDate.localeCompare(b.workDate));
    const lines = sortedDays.map((day) => {
      const line = emptyLine(day.workDate);
      line.scheduledWorkMinutes = day.scheduledWorkMinutes;
      line.approvedOvertimeMinutes = day.approvedOvertimeMinutes;
      line.unapprovedOvertimeMinutes = day.unapprovedOvertimeMinutes;
      line.nightWorkMinutes = day.nightWorkMinutes;
      line.holidayWorkMinutesNormal = day.holidayWorkMinutesNormal;
      line.holidayWorkMinutesExcess = day.holidayWorkMinutesExcess;
      line.absenceDays = day.isAbsence ? 1 : 0;
      line.latenessDays = day.latenessMinutes > 0 ? 1 : 0;
      line.earlyLeaveDays = day.earlyLeaveMinutes > 0 ? 1 : 0;
      line.paidLeaveDays = sumLeaveDays(input.leaveDays, true, day.workDate);
      line.unpaidLeaveDays = sumLeaveDays(input.leaveDays, false, day.workDate);
      // 주휴는 "그 주 전체 소정근로일 개근" 판정이라 일 단위 레이아웃 1행에는
      // 대응되지 않는다 — DAILY 레이아웃은 해당 없음(0)으로 둔다.
      return line;
    });
    return {
      lines,
      breakdown: sortedDays.map((day) => ({ type: 'DAILY_LINE', workDate: day.workDate, source: day })),
    };
  }

  const line = emptyLine(undefined);
  for (const day of input.days) {
    line.scheduledWorkMinutes += day.scheduledWorkMinutes;
    line.approvedOvertimeMinutes += day.approvedOvertimeMinutes;
    line.unapprovedOvertimeMinutes += day.unapprovedOvertimeMinutes;
    line.nightWorkMinutes += day.nightWorkMinutes;
    line.holidayWorkMinutesNormal += day.holidayWorkMinutesNormal;
    line.holidayWorkMinutesExcess += day.holidayWorkMinutesExcess;
    if (day.isAbsence) line.absenceDays += 1;
    if (day.latenessMinutes > 0) line.latenessDays += 1;
    if (day.earlyLeaveMinutes > 0) line.earlyLeaveDays += 1;
  }
  line.paidLeaveDays = sumLeaveDays(input.leaveDays, true);
  line.unpaidLeaveDays = sumLeaveDays(input.leaveDays, false);
  line.weeklyPaidRestEligibleCount = input.weeklyPaidRest.filter((w) => w.eligible).length;
  line.weeklyPaidRestMinutes = input.weeklyPaidRest.reduce((sum, w) => sum + (w.eligible ? w.minutes : 0), 0);

  return {
    lines: [line],
    breakdown: [
      { type: 'MONTHLY_DAYS', count: input.days.length, source: input.days },
      { type: 'MONTHLY_LEAVE_DAYS', source: input.leaveDays },
      { type: 'MONTHLY_WEEKLY_PAID_REST', source: input.weeklyPaidRest },
    ],
  };
}
