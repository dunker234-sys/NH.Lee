import { apiFetch, apiFetchBlob } from '../apiClient';

export type PayrollCloseStatus = 'OPEN' | 'CLOSED' | 'RECLOSED';
export type PayrollCloseStage = 'NOT_STARTED' | 'SITE_SUBMITTED' | 'REGION_APPROVED' | 'HQ_FINALIZED';

export interface PayrollClose {
  id: string;
  siteId: string;
  periodYearMonth: string;
  status: PayrollCloseStatus;
  stage: PayrollCloseStage;
  closedAt: string | null;
  version: number;
  siteSubmittedAt: string | null;
  regionApprovedAt: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
}

export interface PayrollCloseReadiness {
  blocked: boolean;
  unresolvedUnapprovedActualsCount: number;
  hasPendingCorrections: boolean;
  hasPendingAttendance: boolean;
  hasUnresolvedNoShows: boolean;
  reasons: string[];
}

export interface PayrollCloseValidationFinding {
  id: string;
  employeeId: string | null;
  ruleCode: string;
  severity: 'BLOCKING' | 'WARNING' | string;
  message: string;
}

export interface PayrollCloseValidationReport {
  id: string;
  generatedAt: string;
  findingCount: number;
  blockingCount: number;
  acknowledgedAt: string | null;
  findings: PayrollCloseValidationFinding[];
}

export interface PayrollStatementLine {
  employeeId: string;
  employee?: { employeeNo: string; name: string };
  layoutType: 'MONTHLY' | 'DAILY';
  workDate?: string;
  scheduledWorkMinutes: number;
  approvedOvertimeMinutes: number;
  unapprovedOvertimeMinutes: number;
  nightWorkMinutes: number;
  holidayWorkMinutesNormal: number;
  holidayWorkMinutesExcess: number;
  basePayAmount: number;
  overtimePayAmount: number;
  nightPayAmount: number;
}

export interface PayrollExportRecord {
  id: string;
  format: 'EXCEL' | 'CSV';
  exportedAt: string;
  exportedBy: string;
}

function base(siteId: string, yearMonth: string): string {
  return `/admin/payroll-close/${siteId}/${yearMonth}`;
}

/** STEP11 급여 마감 파이프라인 — site 단계(submit)→region 단계(approve)→
 * HQ 단계(finalize), 3단계 결재선(PayrollCloseStage)을 그대로 반영한다. */
export const payrollCloseApi = {
  readiness: (siteId: string, yearMonth: string) => apiFetch<PayrollCloseReadiness>(`${base(siteId, yearMonth)}/readiness`),
  get: (siteId: string, yearMonth: string) => apiFetch<PayrollClose>(base(siteId, yearMonth)),
  submit: (siteId: string, yearMonth: string) => apiFetch<PayrollClose>(`${base(siteId, yearMonth)}/submit`, { method: 'POST' }),
  approve: (siteId: string, yearMonth: string) => apiFetch<PayrollClose>(`${base(siteId, yearMonth)}/approve`, { method: 'POST' }),
  finalize: (siteId: string, yearMonth: string) => apiFetch<PayrollClose>(`${base(siteId, yearMonth)}/finalize`, { method: 'POST' }),
  reopen: (siteId: string, yearMonth: string, reason: string) =>
    apiFetch<PayrollClose>(`${base(siteId, yearMonth)}/reopen`, { method: 'POST', body: { reason } }),

  runValidation: (siteId: string, yearMonth: string) =>
    apiFetch<PayrollCloseValidationReport>(`${base(siteId, yearMonth)}/validation/run`, { method: 'POST' }),
  latestValidation: (siteId: string, yearMonth: string) =>
    apiFetch<PayrollCloseValidationReport | null>(`${base(siteId, yearMonth)}/validation/latest`),
  acknowledgeValidation: (siteId: string, yearMonth: string, reportId: string) =>
    apiFetch<{ acknowledged: boolean }>(`${base(siteId, yearMonth)}/validation/acknowledge`, { method: 'POST', body: { reportId } }),

  previewStatement: (siteId: string, yearMonth: string) =>
    apiFetch<PayrollStatementLine[]>(`${base(siteId, yearMonth)}/statement/preview`),
  computeStatement: (siteId: string, yearMonth: string) =>
    apiFetch<{ lineCount: number }>(`${base(siteId, yearMonth)}/statement/compute`, { method: 'POST' }),
  listStatement: (siteId: string, yearMonth: string) => apiFetch<PayrollStatementLine[]>(base(siteId, yearMonth) + '/statement'),

  export: (siteId: string, yearMonth: string, format: 'EXCEL' | 'CSV') =>
    apiFetchBlob(`${base(siteId, yearMonth)}/export`, { method: 'POST', body: { format } }),
  exportHistory: (siteId: string, yearMonth: string) =>
    apiFetch<PayrollExportRecord[]>(`${base(siteId, yearMonth)}/export/history`),
};

export interface EmployeeWageRate {
  id: string;
  employeeId: string;
  wageType: 'HOURLY' | 'MONTHLY';
  baseAmount: number;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
}

/** 급여 정보라 HQ_HR/ADMIN만 — employee_protected_status와 동일한 권한 모델. */
export const wageRateApi = {
  history: (employeeId: string) => apiFetch<EmployeeWageRate[]>(`/admin/employees/${employeeId}/wage-rate`),
  set: (employeeId: string, input: { wageType: 'HOURLY' | 'MONTHLY'; baseAmount: number; effectiveStartDate: string }) =>
    apiFetch<EmployeeWageRate>(`/admin/employees/${employeeId}/wage-rate`, { method: 'POST', body: input }),
};
