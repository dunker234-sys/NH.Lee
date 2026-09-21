import { AndroidIntegrityFlags, CreatePunchInput } from '@attendance/shared-types';
import { PUNCH_QUEUE_SCHEMA_SQL, PunchQueueRow, PunchQueueStatus } from './schema';

/**
 * expo-sqlite(실제 앱)와 node:sqlite(Jest 테스트)를 동일한 형태로 다루기
 * 위한 최소 인터페이스 — 이 파일은 어느 쪽에도 의존하지 않는 순수 로직이라
 * 시뮬레이터 없이 Node에서 그대로 테스트할 수 있다(계획서 §10.2).
 */
export interface SqlExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: unknown[]): Promise<void>;
  getAllAsync<T>(sql: string, params: unknown[]): Promise<T[]>;
}

export interface EnqueuePunchInput {
  localId: string;
  employeeId: string;
  punchType: CreatePunchInput['punchType'];
  recordedAt: string;
  siteId: string;
  location?: { lat: number; lng: number; accuracyM: number };
  registrationMethod: CreatePunchInput['registrationMethod'];
  deviceId: string;
  qrOrNfcToken?: string;
  wifiBssid?: string;
  cellId?: string;
  clientEventId: string;
  platform?: CreatePunchInput['platform'];
  androidIntegrityFlags?: AndroidIntegrityFlags;
  outOfGeofenceReason?: string;
  createdAt: string;
}

export async function ensureSchema(db: SqlExecutor): Promise<void> {
  await db.execAsync(PUNCH_QUEUE_SCHEMA_SQL);
}

/**
 * 버튼 탭 시 네트워크 시도 전에 호출된다(계획서 §3.2 3번) — 이 INSERT가
 * 커밋된 뒤에야 전송을 시도한다. recordedAt/clientEventId/deviceId는 이후
 * 재전송에서 절대 바뀌지 않는다.
 */
export async function enqueuePunch(db: SqlExecutor, input: EnqueuePunchInput): Promise<void> {
  await db.runAsync(
    `INSERT INTO punch_queue (
      local_id, employee_id, punch_type, recorded_at, site_id,
      location_lat, location_lng, location_accuracy_m,
      registration_method, device_id, qr_or_nfc_token, wifi_bssid, cell_id,
      client_event_id, platform, android_integrity_flags_json, out_of_geofence_reason,
      status, attempt_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)`,
    [
      input.localId,
      input.employeeId,
      input.punchType,
      input.recordedAt,
      input.siteId,
      input.location?.lat ?? null,
      input.location?.lng ?? null,
      input.location?.accuracyM ?? null,
      input.registrationMethod,
      input.deviceId,
      input.qrOrNfcToken ?? null,
      input.wifiBssid ?? null,
      input.cellId ?? null,
      input.clientEventId,
      input.platform ?? null,
      input.androidIntegrityFlags ? JSON.stringify(input.androidIntegrityFlags) : null,
      input.outOfGeofenceReason ?? null,
      input.createdAt,
    ],
  );
}

/** 대기 중(PENDING) 또는 재시도 대상(FAILED_RETRYABLE) 행을 최초 발생 순서대로. */
export async function listPending(db: SqlExecutor): Promise<PunchQueueRow[]> {
  return db.getAllAsync<PunchQueueRow>(
    `SELECT * FROM punch_queue WHERE status IN ('PENDING','FAILED_RETRYABLE') ORDER BY recorded_at ASC`,
    [],
  );
}

export async function listAll(db: SqlExecutor): Promise<PunchQueueRow[]> {
  return db.getAllAsync<PunchQueueRow>(`SELECT * FROM punch_queue ORDER BY recorded_at ASC`, []);
}

export async function countPending(db: SqlExecutor): Promise<number> {
  const rows = await db.getAllAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM punch_queue WHERE status IN ('PENDING','FAILED_RETRYABLE')`,
    [],
  );
  return rows[0]?.n ?? 0;
}

export async function markStatus(db: SqlExecutor, localIds: string[], status: PunchQueueStatus): Promise<void> {
  for (const id of localIds) {
    await db.runAsync(`UPDATE punch_queue SET status = ? WHERE local_id = ?`, [status, id]);
  }
}

export async function markSent(
  db: SqlExecutor,
  localId: string,
  serverPunchId: string,
  serverVerificationLevel: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE punch_queue SET status = 'SENT', server_punch_id = ?, server_verification_level = ? WHERE local_id = ?`,
    [serverPunchId, serverVerificationLevel, localId],
  );
}

export async function markFailedRetryable(db: SqlExecutor, localId: string, attemptedAt: string): Promise<void> {
  await db.runAsync(
    `UPDATE punch_queue SET status = 'FAILED_RETRYABLE', attempt_count = attempt_count + 1, last_attempt_at = ? WHERE local_id = ?`,
    [attemptedAt, localId],
  );
}

/**
 * 큐 행 → 서버 DTO. 여기서 값을 "다시 계산"하지 않고 저장된 값을 그대로
 * 옮기기만 한다는 점이 완료조건1의 핵심이다 — recordedAt이 new Date()로
 * 다시 채워지는 순간 서버 멱등키가 매번 달라져 중복 저장으로 이어진다.
 */
export function toCreatePunchInput(row: PunchQueueRow): CreatePunchInput {
  return {
    punchType: row.punch_type as CreatePunchInput['punchType'],
    recordedAt: row.recorded_at,
    siteId: row.site_id,
    location:
      row.location_lat !== null && row.location_lng !== null && row.location_accuracy_m !== null
        ? { lat: row.location_lat, lng: row.location_lng, accuracyM: row.location_accuracy_m }
        : undefined,
    registrationMethod: row.registration_method as CreatePunchInput['registrationMethod'],
    deviceId: row.device_id,
    qrOrNfcToken: row.qr_or_nfc_token ?? undefined,
    wifiBssid: row.wifi_bssid ?? undefined,
    cellId: row.cell_id ?? undefined,
    clientEventId: row.client_event_id,
    platform: (row.platform as CreatePunchInput['platform']) ?? undefined,
    androidIntegrityFlags: row.android_integrity_flags_json ? JSON.parse(row.android_integrity_flags_json) : undefined,
    outOfGeofenceReason: row.out_of_geofence_reason ?? undefined,
  };
}
