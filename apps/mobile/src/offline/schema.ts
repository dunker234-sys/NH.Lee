// 계획서 §3.1의 스키마. CreatePunchInput(packages/shared-types)의 전 필드를
// 그대로 담는다 — 재전송 시 아무것도 재계산하지 않고 저장된 행을 그대로
// 직렬화하기 위해서다.
export const PUNCH_QUEUE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS punch_queue (
  local_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  punch_type TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_lat REAL,
  location_lng REAL,
  location_accuracy_m REAL,
  registration_method TEXT NOT NULL,
  device_id TEXT NOT NULL,
  qr_or_nfc_token TEXT,
  wifi_bssid TEXT,
  cell_id TEXT,
  client_event_id TEXT NOT NULL,
  platform TEXT,
  android_integrity_flags_json TEXT,
  out_of_geofence_reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  server_punch_id TEXT,
  server_verification_level TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_punch_queue_status ON punch_queue(status);
`;

export type PunchQueueStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED_RETRYABLE';

export interface PunchQueueRow {
  local_id: string;
  employee_id: string;
  punch_type: string;
  recorded_at: string;
  site_id: string;
  location_lat: number | null;
  location_lng: number | null;
  location_accuracy_m: number | null;
  registration_method: string;
  device_id: string;
  qr_or_nfc_token: string | null;
  wifi_bssid: string | null;
  cell_id: string | null;
  client_event_id: string;
  platform: string | null;
  android_integrity_flags_json: string | null;
  out_of_geofence_reason: string | null;
  status: PunchQueueStatus;
  server_punch_id: string | null;
  server_verification_level: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  created_at: string;
}
