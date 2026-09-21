import { BulkPunchItemResult, CreatePunchInput, CreatePunchResult } from '@attendance/shared-types';
import { PunchQueueRow } from './schema';

/**
 * flush.service.ts의 상태기계를 punchApi/expo-sqlite로부터 분리한 순수
 * 버전 — expo-sqlite는 Metro/Expo 런타임 밖(plain Node)에서 아예 로드되지
 * 않아(네이티브 모듈 해석 실패) flush.service.ts를 그대로 Jest에서 import할
 * 수 없다. 이 파일은 그 의존성을 인터페이스로 뽑아내 오케스트레이션
 * 로직만 시뮬레이터 없이 검증할 수 있게 한다(계획서 §10.2).
 */
export interface FlushQueueDeps {
  listPending(): Promise<PunchQueueRow[]>;
  markSending(localIds: string[]): Promise<void>;
  markSent(localId: string, serverPunchId: string, verificationLevel: string): Promise<void>;
  markFailedRetryable(localId: string): Promise<void>;
}

export interface FlushApiDeps {
  create(input: CreatePunchInput): Promise<CreatePunchResult>;
  createBulk(items: CreatePunchInput[], lastKnownServerSyncTime: string): Promise<{ results: BulkPunchItemResult[] }>;
  isRecoverableApiError(e: unknown): boolean;
}

export interface FlushSyncTimeDeps {
  get(): Promise<string>;
  set(iso: string): Promise<void>;
}

export interface FlushDeps {
  queue: FlushQueueDeps;
  api: FlushApiDeps;
  syncTime: FlushSyncTimeDeps;
  toCreatePunchInput(row: PunchQueueRow): CreatePunchInput;
}

export async function runFlush(deps: FlushDeps): Promise<void> {
  const pending = await deps.queue.listPending();
  if (pending.length === 0) return;

  if (pending.length === 1) {
    const row = pending[0];
    await deps.queue.markSending([row.local_id]);
    try {
      const result = await deps.api.create(deps.toCreatePunchInput(row));
      await deps.queue.markSent(row.local_id, result.punchId, result.verificationLevel);
      await deps.syncTime.set(new Date().toISOString());
    } catch (e) {
      await deps.queue.markFailedRetryable(row.local_id);
      if (!deps.api.isRecoverableApiError(e)) throw e;
    }
    return;
  }

  await deps.queue.markSending(pending.map((r) => r.local_id));
  try {
    const syncTime = await deps.syncTime.get();
    const { results } = await deps.api.createBulk(pending.map((r) => deps.toCreatePunchInput(r)), syncTime);
    await Promise.all(
      results.map(async (result, index) => {
        const row = pending[index];
        if (result.status === 'CREATED' || result.status === 'DUPLICATE') {
          await deps.queue.markSent(row.local_id, result.punchId!, result.verificationLevel!);
        } else {
          await deps.queue.markFailedRetryable(row.local_id);
        }
      }),
    );
    await deps.syncTime.set(new Date().toISOString());
  } catch (e) {
    await Promise.all(pending.map((row) => deps.queue.markFailedRetryable(row.local_id)));
    if (!deps.api.isRecoverableApiError(e)) throw e;
  }
}
