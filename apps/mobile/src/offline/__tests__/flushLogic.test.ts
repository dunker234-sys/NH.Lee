import { CreatePunchInput } from '@attendance/shared-types';
import { FlushApiDeps, FlushQueueDeps, FlushSyncTimeDeps, runFlush } from '../flushLogic';
import { PunchQueueRow } from '../schema';

class RecoverableError extends Error {}

function makeRow(overrides: Partial<PunchQueueRow> = {}): PunchQueueRow {
  return {
    local_id: 'local-1',
    employee_id: 'emp-1',
    punch_type: 'IN',
    recorded_at: '2026-08-27T00:00:00.000Z',
    site_id: 'site-1',
    location_lat: null,
    location_lng: null,
    location_accuracy_m: null,
    registration_method: 'GPS',
    device_id: 'device-1',
    qr_or_nfc_token: null,
    wifi_bssid: null,
    cell_id: null,
    client_event_id: 'ce-1',
    platform: null,
    android_integrity_flags_json: null,
    out_of_geofence_reason: null,
    status: 'PENDING',
    server_punch_id: null,
    server_verification_level: null,
    attempt_count: 0,
    last_attempt_at: null,
    created_at: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

/** 실제 SQLite 대신 메모리 배열로 큐를 흉내내는 페이크 — flushLogic의
 * 오케스트레이션(단일/벌크 선택, 결과→상태 매핑)만 검증한다. */
function makeFakeQueue(rows: PunchQueueRow[]) {
  const sentCalls: { localId: string; serverPunchId: string; level: string }[] = [];
  const failedCalls: string[] = [];
  const sendingCalls: string[][] = [];
  const deps: FlushQueueDeps = {
    async listPending() {
      return rows.filter((r) => r.status === 'PENDING' || r.status === 'FAILED_RETRYABLE');
    },
    async markSending(localIds) {
      sendingCalls.push(localIds);
      for (const id of localIds) {
        const row = rows.find((r) => r.local_id === id)!;
        row.status = 'SENDING';
      }
    },
    async markSent(localId, serverPunchId, level) {
      sentCalls.push({ localId, serverPunchId, level });
      const row = rows.find((r) => r.local_id === localId)!;
      row.status = 'SENT';
    },
    async markFailedRetryable(localId) {
      failedCalls.push(localId);
      const row = rows.find((r) => r.local_id === localId)!;
      row.status = 'FAILED_RETRYABLE';
      row.attempt_count += 1;
    },
  };
  return { deps, sentCalls, failedCalls, sendingCalls };
}

function toCreatePunchInput(row: PunchQueueRow): CreatePunchInput {
  return {
    punchType: row.punch_type as CreatePunchInput['punchType'],
    recordedAt: row.recorded_at,
    siteId: row.site_id,
    registrationMethod: row.registration_method as CreatePunchInput['registrationMethod'],
    deviceId: row.device_id,
    clientEventId: row.client_event_id,
  };
}

function makeSyncTime(): FlushSyncTimeDeps & { setCalls: string[] } {
  const setCalls: string[] = [];
  return {
    async get() {
      return '2026-08-26T00:00:00.000Z';
    },
    async set(iso) {
      setCalls.push(iso);
    },
    setCalls,
  };
}

describe('flushLogic.runFlush — 오케스트레이션(단일/벌크 선택, 결과→상태 매핑)', () => {
  it('대기 행이 없으면 API를 호출하지 않는다', async () => {
    const { deps: queue } = makeFakeQueue([]);
    let called = false;
    const api: FlushApiDeps = {
      async create() {
        called = true;
        throw new Error('should not be called');
      },
      async createBulk() {
        called = true;
        throw new Error('should not be called');
      },
      isRecoverableApiError: () => true,
    };
    await runFlush({ queue, api, syncTime: makeSyncTime(), toCreatePunchInput });
    expect(called).toBe(false);
  });

  it('대기 행이 1건이면 POST /punches(단일)를 호출하고 성공 시 SENT로 전이한다', async () => {
    const { deps: queue, sentCalls } = makeFakeQueue([makeRow()]);
    let bulkCalled = false;
    const api: FlushApiDeps = {
      async create(input) {
        expect(input.recordedAt).toBe('2026-08-27T00:00:00.000Z');
        return { punchId: 'server-1', duplicate: false, verificationLevel: 'NORMAL', integrityFlags: [] };
      },
      async createBulk() {
        bulkCalled = true;
        return { results: [] };
      },
      isRecoverableApiError: () => true,
    };
    const syncTime = makeSyncTime();
    await runFlush({ queue, api, syncTime, toCreatePunchInput });

    expect(bulkCalled).toBe(false);
    expect(sentCalls).toEqual([{ localId: 'local-1', serverPunchId: 'server-1', level: 'NORMAL' }]);
    expect(syncTime.setCalls).toHaveLength(1);
  });

  it('단일 전송이 복구가능 오류로 실패하면 FAILED_RETRYABLE로 전이하고 예외를 던지지 않는다', async () => {
    const { deps: queue, failedCalls, sentCalls } = makeFakeQueue([makeRow()]);
    const api: FlushApiDeps = {
      async create() {
        throw new RecoverableError('network down');
      },
      async createBulk() {
        return { results: [] };
      },
      isRecoverableApiError: (e) => e instanceof RecoverableError,
    };
    const syncTime = makeSyncTime();
    await expect(runFlush({ queue, api, syncTime, toCreatePunchInput })).resolves.toBeUndefined();

    expect(failedCalls).toEqual(['local-1']);
    expect(sentCalls).toHaveLength(0);
    expect(syncTime.setCalls).toHaveLength(0);
  });

  it('복구 불가능한 예외는 FAILED_RETRYABLE로 표시한 뒤에도 다시 던진다', async () => {
    const { deps: queue, failedCalls } = makeFakeQueue([makeRow()]);
    const api: FlushApiDeps = {
      async create() {
        throw new Error('unexpected bug');
      },
      async createBulk() {
        return { results: [] };
      },
      isRecoverableApiError: () => false,
    };
    await expect(runFlush({ queue, api, syncTime: makeSyncTime(), toCreatePunchInput })).rejects.toThrow('unexpected bug');
    expect(failedCalls).toEqual(['local-1']); // 상태 기록은 되고 나서 예외가 전파된다
  });

  it('대기 행이 2건 이상이면 POST /punches/bulk를 호출하고, CREATED/DUPLICATE는 SENT, FAILED는 FAILED_RETRYABLE로 매핑한다', async () => {
    const rows = [makeRow({ local_id: 'a', client_event_id: 'ce-a' }), makeRow({ local_id: 'b', client_event_id: 'ce-b' })];
    const { deps: queue, sentCalls, failedCalls, sendingCalls } = makeFakeQueue(rows);
    let createCalled = false;
    const api: FlushApiDeps = {
      async create() {
        createCalled = true;
        throw new Error('should not be called for 2+ rows');
      },
      async createBulk(items, lastKnownServerSyncTime) {
        expect(items).toHaveLength(2);
        expect(lastKnownServerSyncTime).toBe('2026-08-26T00:00:00.000Z');
        return {
          results: [
            { index: 0, status: 'CREATED', punchId: 'server-a', verificationLevel: 'NORMAL' },
            { index: 1, status: 'FAILED', error: 'boom' },
          ],
        };
      },
      isRecoverableApiError: () => true,
    };
    await runFlush({ queue, api, syncTime: makeSyncTime(), toCreatePunchInput });

    expect(createCalled).toBe(false);
    expect(sendingCalls).toEqual([['a', 'b']]);
    expect(sentCalls).toEqual([{ localId: 'a', serverPunchId: 'server-a', level: 'NORMAL' }]);
    expect(failedCalls).toEqual(['b']);
  });

  it('DUPLICATE 상태도 CREATED와 동일하게 SENT로 매핑한다 — 서버 멱등 응답도 성공 취급', async () => {
    const rows = [makeRow({ local_id: 'a', client_event_id: 'ce-a' }), makeRow({ local_id: 'b', client_event_id: 'ce-b' })];
    const { deps: queue, sentCalls } = makeFakeQueue(rows);
    const api: FlushApiDeps = {
      async create() {
        throw new Error('n/a');
      },
      async createBulk() {
        return {
          results: [
            { index: 0, status: 'CREATED', punchId: 'server-a', verificationLevel: 'NORMAL' },
            { index: 1, status: 'DUPLICATE', punchId: 'server-b', verificationLevel: 'LOW' },
          ],
        };
      },
      isRecoverableApiError: () => true,
    };
    await runFlush({ queue, api, syncTime: makeSyncTime(), toCreatePunchInput });
    expect(sentCalls.map((c) => c.localId).sort()).toEqual(['a', 'b']);
  });

  it('벌크 전송 자체가 네트워크 오류로 실패하면 대기 행 전부 FAILED_RETRYABLE로 전이한다', async () => {
    const rows = [makeRow({ local_id: 'a', client_event_id: 'ce-a' }), makeRow({ local_id: 'b', client_event_id: 'ce-b' })];
    const { deps: queue, failedCalls } = makeFakeQueue(rows);
    const api: FlushApiDeps = {
      async create() {
        throw new Error('n/a');
      },
      async createBulk() {
        throw new RecoverableError('offline');
      },
      isRecoverableApiError: (e) => e instanceof RecoverableError,
    };
    await runFlush({ queue, api, syncTime: makeSyncTime(), toCreatePunchInput });
    expect(failedCalls.sort()).toEqual(['a', 'b']);
  });
});
