import { apiFetch, buildQuery } from '../apiClient';

export interface QrPosterCode {
  code: string;
  workDate: string;
  validUntil: string;
}

/** 인쇄용 일단위 QR(수정사항: PC 타각 일단위 QR 출력) — 근로일 단위로 KST 자정에만
 * 바뀌는 정적 코드. 키오스크의 60초 회전 QR과는 별개 경로다. */
export const qrPosterApi = {
  get: (siteId: string) => apiFetch<QrPosterCode>(`/admin/punch/qr-poster${buildQuery({ siteId })}`),
  provision: (siteId: string) => apiFetch<QrPosterCode>('/admin/punch/qr-poster/provision', { method: 'POST', body: { siteId } }),
};
