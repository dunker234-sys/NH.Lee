import { kioskApiFetch } from './kioskApiClient';

export interface PairResult {
  kioskDeviceId: string;
  siteId: string;
  siteName: string;
}

export interface KioskPunchInput {
  employeeNo: string;
  pin: string;
  punchType: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN';
  recordedAt: string;
  clientEventId: string;
}

export interface KioskPunchResponse {
  punchId: string;
  punchType: string;
  maskedName: string;
  verificationLevel: 'NORMAL' | 'LOW';
  completedAt: string;
}

export interface KioskBulkItemResult {
  index: number;
  status: 'CREATED' | 'DUPLICATE' | 'FAILED';
  punchId?: string;
  verificationLevel?: string;
  error?: string;
}

export interface QrCodeResponse {
  code: string;
  periodSeconds: number;
  expiresAt: string;
}

export const kioskApi = {
  pair(credential: string): Promise<PairResult> {
    return kioskApiFetch('/kiosk/pair', { method: 'POST', body: { credential } });
  },

  punchOne(credential: string, input: KioskPunchInput): Promise<KioskPunchResponse> {
    return kioskApiFetch('/kiosk/punches', { method: 'POST', body: input, credential });
  },

  punchBulk(
    credential: string,
    items: KioskPunchInput[],
    lastKnownServerSyncTime: string,
  ): Promise<{ results: KioskBulkItemResult[] }> {
    return kioskApiFetch('/kiosk/punches/bulk', { method: 'POST', body: { items, lastKnownServerSyncTime }, credential });
  },

  getQrCode(credential: string): Promise<QrCodeResponse> {
    return kioskApiFetch('/kiosk/qr-code', { credential });
  },
};
