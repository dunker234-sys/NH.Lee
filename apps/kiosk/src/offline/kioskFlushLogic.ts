import type { KioskQueueRow } from './schema';

/**
 * apps/mobile/src/offline/flushLogic.ts와 같은 모양의 오케스트레이션 —
 * 이 저장소 규칙(CLAUDE.md "앱 간 코드 공유는 packages/shared-types를
 * 통해서만")상 로직 자체를 import로 공유하지 않고 포팅한다. 차이점: 큐
 * 항목이 이미 검증된 CreatePunchInput이 아니라 (employeeNo, 암호화된 PIN)
 * 이다 — 오프라인 중에는 PIN을 서버에 검증받을 방법이 없었으므로, 재연결
 * 시점에 항목별로 실제 검증이 이뤄진다(§7.2).
 */
export interface FlushQueueDeps {
  listPending(): Promise<KioskQueueRow[]>;
  markSending(localIds: string[]): Promise<void>;
  markSent(localId: string): Promise<void>;
  markFailedRetryable(localId: string): Promise<void>;
}

export interface PunchItemInput {
  employeeNo: string;
  pin: string;
  punchType: KioskQueueRow['punchType'];
  recordedAt: string;
  clientEventId: string;
}

export interface BulkResultItem {
  index: number;
  status: 'CREATED' | 'DUPLICATE' | 'FAILED';
}

export interface FlushApiDeps {
  punchOne(input: PunchItemInput): Promise<{ punchId: string }>;
  punchBulk(items: PunchItemInput[], lastKnownServerSyncTime: string): Promise<{ results: BulkResultItem[] }>;
  isRecoverableApiError(e: unknown): boolean;
}

export interface FlushCryptoDeps {
  decryptPin(ciphertext: string): Promise<string>;
}

export interface FlushSyncTimeDeps {
  get(): Promise<string>;
  set(iso: string): Promise<void>;
}

export interface FlushDeps {
  queue: FlushQueueDeps;
  api: FlushApiDeps;
  crypto: FlushCryptoDeps;
  syncTime: FlushSyncTimeDeps;
}

async function toPunchItemInput(row: KioskQueueRow, crypto: FlushCryptoDeps): Promise<PunchItemInput> {
  return {
    employeeNo: row.employeeNo,
    pin: await crypto.decryptPin(row.pinCiphertext),
    punchType: row.punchType,
    recordedAt: row.recordedAt,
    clientEventId: row.clientEventId,
  };
}

export async function runKioskFlush(deps: FlushDeps): Promise<void> {
  const pending = await deps.queue.listPending();
  if (pending.length === 0) return;

  if (pending.length === 1) {
    const row = pending[0];
    await deps.queue.markSending([row.localId]);
    try {
      const input = await toPunchItemInput(row, deps.crypto);
      await deps.api.punchOne(input);
      await deps.queue.markSent(row.localId);
      await deps.syncTime.set(new Date().toISOString());
    } catch (e) {
      await deps.queue.markFailedRetryable(row.localId);
      if (!deps.api.isRecoverableApiError(e)) throw e;
    }
    return;
  }

  await deps.queue.markSending(pending.map((r) => r.localId));
  try {
    const syncTime = await deps.syncTime.get();
    const items = await Promise.all(pending.map((row) => toPunchItemInput(row, deps.crypto)));
    const { results } = await deps.api.punchBulk(items, syncTime);
    await Promise.all(
      results.map(async (result, index) => {
        const row = pending[index];
        if (result.status === 'CREATED' || result.status === 'DUPLICATE') {
          await deps.queue.markSent(row.localId);
        } else {
          await deps.queue.markFailedRetryable(row.localId);
        }
      }),
    );
    await deps.syncTime.set(new Date().toISOString());
  } catch (e) {
    await Promise.all(pending.map((row) => deps.queue.markFailedRetryable(row.localId)));
    if (!deps.api.isRecoverableApiError(e)) throw e;
  }
}
