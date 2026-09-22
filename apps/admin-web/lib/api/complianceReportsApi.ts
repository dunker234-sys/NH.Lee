import { apiFetch, apiFetchBlob, buildQuery } from '../apiClient';

export interface NoShowReportRow {
  employeeId: string;
  employeeName: string;
  siteId: string;
  siteName: string;
  workDate: string;
  detectedAt: string;
  notifiedAt: string | null;
}

export interface EarlyClockInReportRow {
  employeeId: string;
  employeeName: string;
  siteId: string;
  siteName: string;
  yearMonth: string;
  occurrenceCount: number;
  detectedAt: string;
  resolvedAt: string | null;
}

export interface EmployeeUnapprovedOvertimeRow {
  employeeId: string;
  employeeName: string;
  unresolvedDayCount: number;
  totalUnapprovedMinutes: number;
}

export interface SiteUnapprovedOvertimeRow {
  siteId: string;
  siteName: string;
  unresolvedDayCount: number;
  totalUnapprovedMinutes: number;
  employeeCount: number;
}

export interface SiteOvertimeComparisonRow {
  siteId: string;
  siteName: string;
  totalOvertimeForPremiumMinutes: number;
  violationWeekCount: number;
  atRiskEmployeeCount: number;
}

export interface ViolationHistoryRow {
  employeeId: string;
  employeeName: string;
  siteId: string;
  siteName: string;
  weekStartDate: string;
  totalWorkMinutes: number;
  over40Minutes: number;
  alertStage: string;
}

/** 요구사항서 4.4④ 준법 리포트 — 4개 하위 데이터 소스를 그대로 반영한다. */
export const complianceReportsApi = {
  noShow: (params: { from: string; to: string; siteId?: string }) =>
    apiFetch<NoShowReportRow[]>(`/admin/compliance-reports/no-show${buildQuery(params)}`),
  earlyClockIn: (params: { yearMonth?: string; siteId?: string }) =>
    apiFetch<EarlyClockInReportRow[]>(`/admin/compliance-reports/early-clockin${buildQuery(params)}`),
  unapprovedUnjudged: (params: { yearMonth: string; siteId?: string }) =>
    apiFetch<EmployeeUnapprovedOvertimeRow[] | SiteUnapprovedOvertimeRow[]>(`/admin/compliance-reports/unapproved-unjudged${buildQuery(params)}`),
  siteComparison: (period: string) =>
    apiFetch<SiteOvertimeComparisonRow[]>(`/admin/compliance-reports/overtime-stats/site-comparison${buildQuery({ period })}`),
  violationHistory: (params: { from: string; to: string; siteId?: string }) =>
    apiFetch<ViolationHistoryRow[]>(`/admin/compliance-reports/overtime-stats/violation-history${buildQuery(params)}`),
  exportViolationHistory: (params: { from: string; to: string; siteId?: string }) =>
    apiFetchBlob(`/admin/compliance-reports/overtime-stats/violation-history/export${buildQuery(params)}`),
};

export interface NightWorkHealthCheckupTargetRow {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  siteId: string;
  siteName: string;
  criterion1Count: number;
  criterion1Met: boolean;
  criterion2TotalMinutes: number;
  criterion2Met: boolean;
  windowEndDate: string;
  calculatedAt: string;
}

/** 야간작업 특수건강진단(산안법 §130) — 근기법 야간(22~06시)과 판정
 * 시간대가 다르다(용어집). 사전 계산된 결과만 조회하고, 재계산은 별도
 * 배치 트리거로 수행한다. */
export const nightWorkHealthCheckupApi = {
  list: (siteId?: string) => apiFetch<NightWorkHealthCheckupTargetRow[]>(`/admin/compliance-reports/night-work-health-checkup${buildQuery({ siteId })}`),
  recalculate: (asOfDate: string, siteId?: string) =>
    apiFetch('/admin/compliance-reports/night-work-health-checkup/recalculate', { method: 'POST', body: { asOfDate, siteId } }),
};
