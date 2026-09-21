import { runKioskFlush } from '../kioskFlushLogic';
import type { BulkResultItem, FlushApiDeps, FlushQueueDeps, PunchItemInput } from '../kioskFlushLogic';
import type { KioskQueueRow } from '../schema';

class RecoverableError extends Error {}

function makeRow(overrides: Partial<KioskQueueRow> = {}): KioskQueueRow {
  return {
    localId: 'local-1',
    employeeNo: 'EMP-1',
    pinCiphertext: 'iv:cipher',
    punchType: 'IN',
    recordedAt: '2026-08-28T00:00:00.000Z',
    clientEventId: 'ce-1',
    status: 'PENDING',
    attemptCount: 0,
    createdAt: '2026-08-28T00:00:00.000Z',
    ...overrides,
  };
}

function makeFakeQueue(rows: KioskQueueRow[]) {
  const sentIds: string[] = [];
  const failedIds: string[] = [];
  const sendingCalls: string[][] = [];
  const deps: FlushQueueDeps = {
    async listPending() {
      return rows.filter((r) => r.status === 'PENDING' || r.status === 'FAILED_RETRYABLE');
    },
    async markSending(localIds) {
      sendingCalls.push(localIds);
      localIds.forEach((id) => {
        rows.find((r) => r.localId === id)!.status = 'SENDING';
      });
    },
    async markSent(localId) {
      sentIds.push(localId);
      rows.find((r) => r.localId === localId)!.status = 'SENT';
    },
    async markFailedRetryable(localId) {
      failedIds.push(localId);
      const row = rows.find((r) => r.localId === localId)!;
      row.status = 'FAILED_RETRYABLE';
      row.attemptCount += 1;
    },
  };
  return { deps, sentIds, failedIds, sendingCalls };
}

function makeCrypto() {
  return { async decryptPin(ciphertext: string) { return `decrypted(${ciphertext})`; } };
}

function makeSyncTime() {
  const setCalls: string[] = [];
  return { async get() { return '2026-08-27T00:00:00.000Z'; }, async set(iso: string) { setCalls.push(iso); }, setCalls };
}

describe('kioskFlushLogic.runKioskFlush', () => {
  it('대기 행이 없으면 API를 호출하지 않는다', async () => {
    const { deps: queue } = makeFakeQueue([]);
    let called = false;
    const api: FlushApiDeps = {
      async punchOne() { called = true; return { punchId: 'x' }; },
      async punchBulk() { called = true; return { results: [] }; },
      isRecoverableApiError: () => true,
    };
    await runKioskFlush({ queue, api, crypto: makeCrypto(), syncTime: makeSyncTime() });
    expect(called).toBe(false);
  });

  it('대기 행이 1건이면 punchOne을 호출하고 성공 시 SENT로 전이하며 PIN을 복호화해 전달한다', async () => {
    const { deps: queue, sentIds } = makeFakeQueue([makeRow()]);
    let receivedInput: PunchItemInput | null = null;
    const api: FlushApiDeps = {
      async punchOne(input) {
        receivedInput = input;
        return { punchId: 'server-1' };
      },
      async punchBulk() {
        throw new Error('should not be called for 1 row');
      },
      isRecoverableApiError: () => true,
    };
    const syncTime = makeSyncTime();
    await runKioskFlush({ queue, api, crypto: makeCrypto(), syncTime });

    expect(receivedInput).toEqual({
      employeeNo: 'EMP-1',
      pin: 'decrypted(iv:cipher)',
      punchType: 'IN',
      recordedAt: '2026-08-28T00:00:00.000Z',
      clientEventId: 'ce-1',
    });
    expect(sentIds).toEqual(['local-1']);
    expect(syncTime.setCalls).toHaveLength(1);
  });

  it('단일 전송이 복구가능 오류로 실패하면 FAILED_RETRYABLE로 전이하고 예외를 던지지 않는다', async () => {
    const { deps: queue, failedIds, sentIds } = makeFakeQueue([makeRow()]);
    const api: FlushApiDeps = {
      async punchOne() { throw new RecoverableError('offline'); },
      async punchBulk() { return { results: [] }; },
      isRecoverableApiError: (e) => e instanceof RecoverableError,
    };
    await expect(runKioskFlush({ queue, api, crypto: makeCrypto(), syncTime: makeSyncTime() })).resolves.toBeUndefined();
    expect(failedIds).toEqual(['local-1']);
    expect(sentIds).toHaveLength(0);
  });

  it('대기 행이 2건 이상이면 punchBulk를 호출하고 CREATED/DUPLICATE는 SENT, FAILED는 FAILED_RETRYABLE로 매핑한다', async () => {
    const rows = [makeRow({ localId: 'a', clientEventId: 'ce-a' }), makeRow({ localId: 'b', clientEventId: 'ce-b' })];
    const { deps: queue, sentIds, failedIds, sendingCalls } = makeFakeQueue(rows);
    let oneCalled = false;
    const api: FlushApiDeps = {
      async punchOne() { oneCalled = true; return { punchId: 'x' }; },
      async punchBulk(items, lastKnownServerSyncTime) {
        expect(items).toHaveLength(2);
        expect(lastKnownServerSyncTime).toBe('2026-08-27T00:00:00.000Z');
        const results: BulkResultItem[] = [
          { index: 0, status: 'CREATED' },
          { index: 1, status: 'FAILED' },
        ];
        return { results };
      },
      isRecoverableApiError: () => true,
    };
    await runKioskFlush({ queue, api, crypto: makeCrypto(), syncTime: makeSyncTime() });

    expect(oneCalled).toBe(false);
    expect(sendingCalls).toEqual([['a', 'b']]);
    expect(sentIds).toEqual(['a']);
    expect(failedIds).toEqual(['b']);
  });

  it('벌크 전송 자체가 실패하면 대기 행 전부 FAILED_RETRYABLE로 전이한다', async () => {
    const rows = [makeRow({ localId: 'a', clientEventId: 'ce-a' }), makeRow({ localId: 'b', clientEventId: 'ce-b' })];
    const { deps: queue, failedIds } = makeFakeQueue(rows);
    const api: FlushApiDeps = {
      async punchOne() { throw new Error('n/a'); },
      async punchBulk() { throw new RecoverableError('offline'); },
      isRecoverableApiError: (e) => e instanceof RecoverableError,
    };
    await runKioskFlush({ queue, api, crypto: makeCrypto(), syncTime: makeSyncTime() });
    expect(failedIds.sort()).toEqual(['a', 'b']);
  });
});
