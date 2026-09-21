export const ALERT_LOG_CHANNELS = ['PUSH', 'EMAIL', 'IN_APP'] as const;
export type AlertLogChannel = (typeof ALERT_LOG_CHANNELS)[number];

export const ALERT_LOG_RESULTS = ['PENDING', 'SUCCESS', 'FAILED_RETRYING', 'FAILED_FINAL', 'SUPPRESSED'] as const;
export type AlertLogResult = (typeof ALERT_LOG_RESULTS)[number];

/** GET /alert-log 응답 항목 — dedupKey 등 내부 필드는 서버가 이미 투영에서 제외한다. */
export interface AlertLogEntry {
  id: string;
  notificationType: string;
  channel: AlertLogChannel;
  result: AlertLogResult;
  requestedAt: string;
  sentAt: string | null;
  payload: Record<string, unknown>;
  locale: string;
}

export interface LocationAccessLogEntry {
  id: string;
  punchLocationId: string | null;
  accessedBy: string;
  accessPurpose: string;
  accessedAt: string;
}

export interface CursorPage<T> {
  items: T[];
  hasMore: boolean;
}
