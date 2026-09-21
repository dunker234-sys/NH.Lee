/** apps/api prisma/schema.prisma의 ConsentType/ConsentStatus를 손으로 미러링한다. */
export const CONSENT_TYPES = ['LOCATION_COLLECTION', 'NOTIFICATION'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_STATUSES = ['AGREED', 'PAUSED', 'WITHDRAWN'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export interface ConsentRecord {
  id: string;
  employeeId: string;
  consentType: ConsentType;
  status: ConsentStatus;
  agreedAt: string | null;
  pausedAt: string | null;
  withdrawnAt: string | null;
  policyVersion: string;
  createdAt: string;
}

export interface ConsentStatusView {
  current: ConsentRecord | null;
  history: ConsentRecord[];
}

export interface ConsentPolicyView {
  policyVersion: string;
  retentionDays: number;
}
