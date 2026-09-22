import { apiFetch } from '../apiClient';

export interface ProvisionKioskDeviceResult {
  kioskDeviceId: string;
  siteId: string;
  label: string;
  /** 이 응답에서 딱 한 번만 노출된다(저장은 해시만) — QR 시크릿과 동일 원칙. */
  credential: string;
}

/** 키오스크 기기 페어링 발급/폐기. 목록 조회 엔드포인트는 백엔드에 아직
 * 없다(provision/revoke만 존재) — 폐기는 기기 ID를 직접 입력해야 한다. */
export const kioskDevicesApi = {
  provision: (siteId: string, label: string) =>
    apiFetch<ProvisionKioskDeviceResult>('/admin/kiosk-devices', { method: 'POST', body: { siteId, label } }),
  revoke: (id: string) => apiFetch(`/admin/kiosk-devices/${id}/revoke`, { method: 'POST' }),
};
