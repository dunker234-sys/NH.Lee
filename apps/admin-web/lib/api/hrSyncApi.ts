import { apiFetch } from '../apiClient';

export type HrSyncBatchStatus = 'PENDING_REVIEW' | 'AUTO_APPLIED' | 'APPLIED' | 'REJECTED';
export type HrSyncRowChangeType = 'NEW' | 'CHANGED' | 'DEPARTED' | 'ERROR';

export interface HrSyncBatch {
  id: string;
  status: HrSyncBatchStatus;
  sourceAdapterType: string;
  totalCount: number;
  newCount: number;
  changedCount: number;
  departedCount: number;
  errorCount: number;
  changeRatio: string;
  appliedAt: string | null;
  createdAt: string;
}

export interface HrSyncBatchRow {
  id: string;
  employeeNo: string;
  changeType: HrSyncRowChangeType;
  beforeValue: unknown;
  afterValue: unknown;
  errorMessage: string | null;
}

export interface HrSyncBatchDetail extends HrSyncBatch {
  rows: HrSyncBatchRow[];
}

/** STEP10 인사연동 — dry-run은 저장 없음, run은 야간배치와 동일한 큐
 * 경로(HrSyncConsumer)로 적재 후 changeRatio 임계 초과 시 PENDING_REVIEW로
 * 멈춘다. */
export const hrSyncApi = {
  dryRun: (asOfDate?: string) => apiFetch<HrSyncBatch & { rows: HrSyncBatchRow[] }>('/admin/hr-sync/dry-run', { method: 'POST', body: { asOfDate } }),
  run: (asOfDate?: string) => apiFetch<{ accepted: boolean; asOfDate: string }>('/admin/hr-sync/run', { method: 'POST', body: { asOfDate } }),
  listBatches: (limit = 20) => apiFetch<HrSyncBatch[]>(`/admin/hr-sync/batches?limit=${limit}`),
  getBatch: (id: string) => apiFetch<HrSyncBatchDetail>(`/admin/hr-sync/batches/${id}`),
  approve: (id: string) => apiFetch<{ success: boolean }>(`/admin/hr-sync/batches/${id}/approve`, { method: 'POST' }),
  reject: (id: string) => apiFetch<{ success: boolean }>(`/admin/hr-sync/batches/${id}/reject`, { method: 'POST' }),
};

export interface PartnerCompany {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  active: boolean;
}

/** 파견·협력업체 관리 — 협력사 자체는 org-scope 개념이 아니라 HQ_HR/ADMIN
 * 역할 게이트만 적용된다. */
export const partnerCompanyApi = {
  list: () => apiFetch<PartnerCompany[]>('/admin/partner-companies'),
  create: (input: { code: string; name: string; contactName?: string; contactEmail?: string }) =>
    apiFetch<PartnerCompany>('/admin/partner-companies', { method: 'POST', body: input }),
  deactivate: (id: string) => apiFetch<PartnerCompany>(`/admin/partner-companies/${id}/deactivate`, { method: 'POST' }),
  registerEmployee: (
    id: string,
    input: { employeeNo: string; name: string; primarySiteId: string; hireDate: string; jobTitle?: string; department?: string },
  ) => apiFetch(`/admin/partner-companies/${id}/employees`, { method: 'POST', body: input }),
};
