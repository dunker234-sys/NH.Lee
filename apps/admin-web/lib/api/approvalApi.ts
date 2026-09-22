import { apiFetch, buildQuery } from '../apiClient';

export type OvertimeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type DispatchStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface OvertimeRequest {
  id: string;
  employeeId: string;
  requestType: 'PRE' | 'POST';
  targetDate: string;
  expectedMinutes: number;
  reason: string;
  status: OvertimeRequestStatus;
  approverId: string | null;
  version: number;
}

export interface UnapprovedActualRow {
  employeeId: string;
  employeeName: string;
  workDate: string;
  unapprovedOvertimeMinutes: number;
  existingRequestId: string | null;
  existingRequestStatus: OvertimeRequestStatus | null;
}

export interface BulkApproveResult {
  batchId: string;
  approvedCount: number;
  skippedCount: number;
  overtimeRequestIds: string[];
  skipped: { employeeId: string; targetDate: string; reason: string }[];
}

export interface DispatchRequest {
  id: string;
  employeeId: string;
  originSiteId: string;
  targetSiteId: string | null;
  dispatchType: 'BUSINESS_TRIP' | 'SITE_SUPPORT';
  startDate: string;
  endDate: string;
  reason: string;
  isPostHoc: boolean;
  status: DispatchStatus;
  version: number;
}

export interface WorkNotProvidedJudgment {
  id: string;
  employeeId: string;
  siteId: string;
  workDate: string;
  reason: string;
  judgedBy: string;
  judgedAt: string;
}

/** STEP12 후속: CLAUDE.md 절대 규칙2(미승인 실적 전량 산입) 운영 화면.
 * admin/approval/* 컨트롤러 3종(overtime-requests, dispatch-requests,
 * work-not-provided-judgments)을 그대로 반영한다. */
export const overtimeApi = {
  list: (params: { siteId?: string; status?: OvertimeRequestStatus; from?: string; to?: string }) =>
    apiFetch<OvertimeRequest[]>(`/admin/approval/overtime-requests${buildQuery(params)}`),
  unapprovedActuals: (siteId: string, from: string, to: string) =>
    apiFetch<UnapprovedActualRow[]>(`/admin/approval/overtime-requests/unapproved-actuals${buildQuery({ siteId, from, to })}`),
  bulkApprove: (items: { employeeId: string; targetDate: string }[], reason?: string) =>
    apiFetch<BulkApproveResult>('/admin/approval/overtime-requests/bulk-approve', { method: 'POST', body: { items, reason } }),
  approve: (id: string, expectedVersion: number) =>
    apiFetch<OvertimeRequest>(`/admin/approval/overtime-requests/${id}/approve`, { method: 'POST', body: { expectedVersion } }),
  reject: (id: string, expectedVersion: number, reason?: string) =>
    apiFetch<OvertimeRequest>(`/admin/approval/overtime-requests/${id}/reject`, { method: 'POST', body: { expectedVersion, reason } }),
};

export const dispatchApi = {
  list: (params: { siteId?: string; status?: DispatchStatus }) =>
    apiFetch<DispatchRequest[]>(`/admin/approval/dispatch-requests${buildQuery(params)}`),
  approve: (id: string, expectedVersion: number) =>
    apiFetch<DispatchRequest>(`/admin/approval/dispatch-requests/${id}/approve`, { method: 'POST', body: { expectedVersion } }),
  reject: (id: string, expectedVersion: number, reason?: string) =>
    apiFetch<DispatchRequest>(`/admin/approval/dispatch-requests/${id}/reject`, { method: 'POST', body: { expectedVersion, reason } }),
};

export const workNotProvidedApi = {
  list: (params: { siteId?: string; from?: string; to?: string }) =>
    apiFetch<WorkNotProvidedJudgment[]>(`/admin/approval/work-not-provided-judgments${buildQuery(params)}`),
  judge: (input: { employeeId: string; workDate: string; reason: string }) =>
    apiFetch<WorkNotProvidedJudgment>('/admin/approval/work-not-provided-judgments', { method: 'POST', body: input }),
};
