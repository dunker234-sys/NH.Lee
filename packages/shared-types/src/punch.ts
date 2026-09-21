/**
 * apps/api/src/modules/punches/dto/create-punch.dto.ts와
 * apps/api/prisma/schema.prisma의 PunchType/RegistrationMethod를 손으로
 * 미러링한다(role.ts와 같은 이유 — 프런트는 @prisma/client를 import할 수
 * 없다). STEP5-A 모바일 오프라인 큐가 서버에 보낼 페이로드를 이 타입으로
 * 고정해, 재전송 시 필드가 조용히 달라지는 것을 컴파일 타임에 막는다.
 */
export const PUNCH_TYPES = ['IN', 'OUT', 'BREAK_OUT', 'BREAK_IN'] as const;
export type PunchType = (typeof PUNCH_TYPES)[number];

export const REGISTRATION_METHODS = ['GPS', 'NFC', 'QR', 'PC', 'TABLET'] as const;
export type RegistrationMethod = (typeof REGISTRATION_METHODS)[number];

export const VERIFICATION_LEVELS = ['NORMAL', 'LOW'] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const CLIENT_PLATFORMS = ['ANDROID', 'IOS', 'OTHER'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export interface AndroidIntegrityFlags {
  mockLocationSuspected: boolean;
  developerModeEnabled: boolean;
  rootedOrJailbroken: boolean;
}

export interface GeoLocationInput {
  lat: number;
  lng: number;
  accuracyM: number;
}

/** POST /punches, POST /punches/bulk의 items[] 원소와 정확히 같은 모양. */
export interface CreatePunchInput {
  punchType: PunchType;
  recordedAt: string; // ISO8601
  siteId: string;
  location?: GeoLocationInput;
  registrationMethod: RegistrationMethod;
  deviceId: string;
  qrOrNfcToken?: string;
  wifiBssid?: string;
  cellId?: string;
  clientEventId: string;
  platform?: ClientPlatform;
  androidIntegrityFlags?: AndroidIntegrityFlags;
  outOfGeofenceReason?: string;
}

export interface CreatePunchResult {
  punchId: string;
  duplicate: boolean;
  verificationLevel: VerificationLevel;
  integrityFlags: string[];
}

export interface BulkPunchItemResult {
  index: number;
  status: 'CREATED' | 'DUPLICATE' | 'FAILED';
  punchId?: string;
  verificationLevel?: VerificationLevel;
  error?: string;
}
