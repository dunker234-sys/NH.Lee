import { apiFetch, buildQuery } from '../apiClient';

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

export interface PartnerLaborCostRow {
  employeeId: string;
  employeeNo: string;
  name: string;
  wageType: string | null;
  baseAmount: number | null;
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
  /** 협력업체 관리자 계정 발급(수정사항) — 응답의 tempPassword는 이번 한 번만 노출된다. */
  registerAdmin: (id: string, input: { employeeNo: string; name: string; primarySiteId: string }) =>
    apiFetch<{ id: string; employeeNo: string; tempPassword: string }>(`/admin/partner-companies/${id}/admins`, { method: 'POST', body: input }),
  /** 파견직 퇴사자 등록(수정사항). */
  resignEmployee: (id: string, employeeId: string, input: { resignationDate: string }) =>
    apiFetch(`/admin/partner-companies/${id}/employees/${employeeId}/resign`, { method: 'POST', body: input }),
  /** 파견직 인건비 확인(수정사항) — 등록된 요율 기준(실지급액 아님). */
  laborCost: (id: string, asOfDate: string) =>
    apiFetch<PartnerLaborCostRow[]>(`/admin/partner-companies/${id}/labor-cost${buildQuery({ asOfDate })}`),
};

export interface MyPartnerEmployee {
  id: string;
  employeeNo: string;
  name: string;
  status: string;
  employmentType: string;
  hireDate: string;
  resignationDate: string | null;
  jobTitle: string | null;
  department: string | null;
}

/** 협력사 담당자(PARTNER 역할) self-service 조회(수정사항). */
export const mePartnerApi = {
  listMyEmployees: () => apiFetch<MyPartnerEmployee[]>('/me/partner/employees'),
};
