import { apiFetch, apiFetchBlob, buildQuery } from '../apiClient';

export interface AuditLogEntry {
  seq: string;
  occurredAt: string;
  eventType: string;
  actorPrincipal: string;
  actorRole: string;
  subjectEmployeeId: string | null;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
}

export interface AuditIntegrityCheckResult {
  ok: boolean;
  [key: string]: unknown;
}

export interface MerkleRoot {
  [key: string]: unknown;
}

/** 요구사항 5 "조회 화면: 기간·사업장·근로자·행위자 필터, 엑셀
 * 내보내기". audit_log는 상태 변경 이벤트만 기록하며 해시체인 +
 * 시간 단위 Merkle 루트로 보호된다(용어집). STEP12 위치정보 파기 배치
 * 실행 확인(PUNCH_LOCATION_PURGED)의 유일한 경로이기도 하다. */
export const auditLogApi = {
  list: (params: { from: string; to: string; siteId?: string; employeeId?: string; actorPrincipal?: string; eventType?: string; page?: string }) =>
    apiFetch<AuditLogEntry[]>(`/admin/audit/log${buildQuery(params)}`),
  export: (params: { from: string; to: string; siteId?: string; employeeId?: string; actorPrincipal?: string; eventType?: string }) =>
    apiFetchBlob(`/admin/audit/log/export${buildQuery(params)}`),
  integrityCheck: (from: string, to: string) => apiFetch<AuditIntegrityCheckResult>(`/admin/audit/integrity-check${buildQuery({ from, to })}`),
  merkleRoots: (from: string, to: string) => apiFetch<MerkleRoot[]>(`/admin/audit/merkle-roots${buildQuery({ from, to })}`),
};
