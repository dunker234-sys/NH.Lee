import { AlertLogEntry, CursorPage } from '@attendance/shared-types';
import { apiFetch } from './client';

export type DeviceTokenPlatform = 'IOS' | 'ANDROID' | 'WEB';

export interface RegisterDeviceTokenInput {
  deviceId: string;
  platform: DeviceTokenPlatform;
  token: string;
}

export interface DeviceTokenResult {
  id: string;
  deviceId: string;
  platform: DeviceTokenPlatform;
  isValid: boolean;
  lastRefreshedAt: string;
}

/** CLAUDE.md 절대 규칙7: 이 파일은 device_token 등록과 alert_log 조회만 한다 —
 * 실제 발송은 전부 서버의 NotificationService가 하고, 이 앱은 FCM/APNs를
 * 직접 호출하지 않는다. */
export const notificationApi = {
  registerDeviceToken(input: RegisterDeviceTokenInput): Promise<DeviceTokenResult> {
    return apiFetch('/device-tokens', { method: 'POST', body: input });
  },

  listAlertLog(params?: { before?: string; limit?: number }): Promise<CursorPage<AlertLogEntry>> {
    return apiFetch('/alert-log', { query: params });
  },
};
