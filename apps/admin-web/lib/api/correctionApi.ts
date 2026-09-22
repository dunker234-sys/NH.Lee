import { apiFetch, buildQuery } from '../apiClient';

export type CorrectionStatus = 'PENDING' | 'APPROVED_L1' | 'APPROVED_L2' | 'REJECTED';
export type CorrectionReasonCode =
  | 'PUNCH_MISSING'
  | 'DEVICE_ERROR'
  | 'NETWORK_FAILURE'
  | 'DISPATCH'
  | 'LOCATION_ERROR'
  | 'SCHEDULE_CHANGE'
  | 'BREAK_NOT_GRANTED'
  | 'OTHER';

export interface CorrectionRequest {
  id: string;
  employeeId: string;
  targetPunchId: string | null;
  targetWorkDate: string;
  reasonCode: CorrectionReasonCode;
  reasonDetail: string;
  afterValue: unknown;
  evidenceUrl: string | null;
  requestSource: 'EMPLOYEE' | 'ADMIN_DIRECT';
  status: CorrectionStatus;
  version: number;
}

/** 2단계 승인(PENDING→APPROVED_L1→APPROVED_L2)은 백엔드가 호출자 역할로
 * 자동 판정한다(correction-approval.service.ts resolveTransition) — 화면은
 * 역할을 신경 쓰지 않고 동일한 approve를 호출하면 된다. */
export const correctionApi = {
  list: (params: { siteId?: string; status?: CorrectionStatus }) =>
    apiFetch<CorrectionRequest[]>(`/admin/correction/requests${buildQuery(params)}`),
  approve: (id: string, expectedVersion: number) =>
    apiFetch<CorrectionRequest>(`/admin/correction/requests/${id}/approve`, { method: 'POST', body: { expectedVersion } }),
  reject: (id: string, expectedVersion: number, reason?: string) =>
    apiFetch<CorrectionRequest>(`/admin/correction/requests/${id}/reject`, { method: 'POST', body: { expectedVersion, reason } }),
};

export interface AdminCorrectionInput {
  employeeId: string;
  targetPunchId?: string;
  targetWorkDate: string;
  reasonCode: CorrectionReasonCode;
  reasonDetail: string;
  afterValue: Record<string, unknown>;
  evidenceUrl?: string;
}

/** 직권 정정(요구사항 4.7-4) — HQ_HR만. requestSource=ADMIN_DIRECT로
 * 생성되며 correctionReportApi로 전량 추적된다. */
export const adminCorrectionApi = {
  create: (input: AdminCorrectionInput) => apiFetch<CorrectionRequest>('/admin/correction/admin-direct', { method: 'POST', body: input }),
};

/** requestSource=ADMIN_DIRECT로 필터하면 그대로 "직권 정정 전량 추적
 * 리포트"다(correction-report.controller.ts 주석과 동일). */
export const correctionReportApi = {
  list: (params: { siteId?: string; employeeId?: string; status?: CorrectionStatus; requestSource?: 'EMPLOYEE' | 'ADMIN_DIRECT'; from?: string; to?: string }) =>
    apiFetch<CorrectionRequest[]>(`/admin/correction/report${buildQuery(params)}`),
};
