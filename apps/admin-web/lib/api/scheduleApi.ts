import { apiFetch, apiFetchMultipart } from '../apiClient';

export interface ShiftTemplate {
  id: string;
  siteId: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string;
  breakStartTime: string | null;
  breakEndTime: string | null;
  crossesMidnight: boolean;
  applicableWeekdays: number[];
  flexibleWorkType: string | null;
}

export interface ScheduleRow {
  id: string;
  employeeId: string;
  siteId: string;
  workDate: string;
  shiftTemplateId: string | null;
  plannedStartAt: string;
  plannedEndAt: string;
  plannedBreakMinutes: number;
  substituteForEmployeeId: string | null;
  substituteReason: string | null;
  assignmentType: 'INTERNAL_SUPPORT' | 'OTHER_SITE_SUPPORT' | 'DAILY_WORKER' | null;
  version: number;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
}

export interface ScheduleGrid {
  scheduleGridVersion: string;
  rows: ScheduleRow[];
}

export interface ScheduleConflict {
  scheduleId: string;
  yourValue: Record<string, unknown>;
  currentValue: Record<string, unknown> | null;
}

export interface RosterAssignmentRule {
  employeeId: string;
  cycleLengthDays: number;
  pattern: (string | null)[];
  anchorDate: string;
}

export interface ScheduleVsActualRow {
  scheduleId: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  workDate: string;
  status: string;
  plannedStartAt: string;
  plannedEndAt: string;
  actualExists: boolean;
  isAbsence: boolean | null;
  latenessMinutes: number | null;
  earlyLeaveMinutes: number | null;
  scheduledExcessMinutes: number | null;
  actualWorkMinutes: number | null;
}

export interface ActualReportDayRow {
  workDate: string;
  scheduleStatus: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  actualExists: boolean;
  isAbsence: boolean | null;
  latenessMinutes: number | null;
  earlyLeaveMinutes: number | null;
  actualWorkMinutes: number | null;
  approvedOvertimeMinutes: number | null;
  unapprovedOvertimeMinutes: number | null;
  nightWorkMinutes: number | null;
  holidayWorkMinutesNormal: number | null;
  holidayWorkMinutesExcess: number | null;
  consecutiveDayNumber: number | null;
  dailyWageAmount: number | null;
}

export interface ActualReportWeekSummary {
  weekStartDate: string;
  weeklyPaidRestEligible: boolean;
  weeklyPaidRestMinutes: number;
  weeklyPaidRestPayAmount: number;
}

export interface ActualReportEmployeeRow {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  days: ActualReportDayRow[];
  weeklySummaries: ActualReportWeekSummary[];
  monthTotal: {
    actualWorkMinutes: number;
    approvedOvertimeMinutes: number;
    unapprovedOvertimeMinutes: number;
    holidayWorkMinutesNormal: number;
    holidayWorkMinutesExcess: number;
    weeklyPaidRestPayAmount: number;
    totalWageAmount: number;
  };
}

export const scheduleApi = {
  listShiftTemplates(siteId: string): Promise<ShiftTemplate[]> {
    return apiFetch(`/admin/schedule/shift-templates?siteId=${siteId}`);
  },
  createShiftTemplate(input: Omit<ShiftTemplate, 'id'>): Promise<ShiftTemplate> {
    return apiFetch('/admin/schedule/shift-templates', { method: 'POST', body: input });
  },
  deleteShiftTemplate(id: string): Promise<{ success: true }> {
    return apiFetch(`/admin/schedule/shift-templates/${id}`, { method: 'DELETE' });
  },

  getGrid(siteId: string, yearMonth: string): Promise<ScheduleGrid> {
    return apiFetch(`/admin/schedule/schedules?siteId=${siteId}&yearMonth=${yearMonth}`);
  },
  patchCell(id: string, expectedVersion: number, fields: Record<string, unknown>): Promise<ScheduleRow> {
    return apiFetch(`/admin/schedule/schedules/${id}`, { method: 'PATCH', body: { expectedVersion, ...fields } });
  },
  patchBulk(cells: { id: string; expectedVersion: number; [k: string]: unknown }[]): Promise<ScheduleRow[]> {
    return apiFetch('/admin/schedule/schedules/bulk', { method: 'PATCH', body: { cells } });
  },
  confirm(scheduleIds: string[], override?: boolean, overrideReason?: string): Promise<ScheduleRow[]> {
    return apiFetch('/admin/schedule/schedules/confirm', { method: 'POST', body: { scheduleIds, override, overrideReason } });
  },
  cancel(id: string): Promise<ScheduleRow> {
    return apiFetch(`/admin/schedule/schedules/${id}/cancel`, { method: 'POST' });
  },
  assignSubstitute(
    id: string,
    input: { substituteEmployeeId: string; assignmentType: string; reason?: string },
  ): Promise<ScheduleRow> {
    return apiFetch(`/admin/schedule/schedules/${id}/substitute`, { method: 'POST', body: input });
  },

  generateRoster(input: {
    siteId: string;
    startDate: string;
    endDate: string;
    assignments: RosterAssignmentRule[];
  }): Promise<{ created: number; rows: ScheduleRow[] }> {
    return apiFetch('/admin/schedule/rosters/generate', { method: 'POST', body: input });
  },

  excelValidate(
    siteId: string,
    yearMonth: string,
    clientGridVersion: string,
    file: File,
  ): Promise<{
    rowErrors: { rowNumber: number; message: string }[];
    conflictDiff: { currentGridVersion: string; currentRows: ScheduleRow[] } | null;
    commitToken: string | null;
  }> {
    const form = new FormData();
    form.set('siteId', siteId);
    form.set('yearMonth', yearMonth);
    form.set('clientGridVersion', clientGridVersion);
    form.set('file', file);
    return apiFetchMultipart('/admin/schedule/excel/validate', form);
  },
  excelCommit(commitToken: string): Promise<{ upserted: number }> {
    return apiFetch('/admin/schedule/excel/commit', { method: 'POST', body: { commitToken } });
  },

  scheduleVsActual(siteId: string, yearMonth: string): Promise<ScheduleVsActualRow[]> {
    return apiFetch(`/admin/schedule/reports/schedule-vs-actual?siteId=${siteId}&yearMonth=${yearMonth}`);
  },
  actualReport(siteId: string, yearMonth: string): Promise<ActualReportEmployeeRow[]> {
    return apiFetch(`/admin/schedule/reports/actual?siteId=${siteId}&yearMonth=${yearMonth}`);
  },
};
