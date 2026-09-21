import { QUEUE_STORAGE_KEY } from './schema';
import type { KioskQueueRow, KioskQueueStatus } from './schema';

/**
 * localStorage(브라우저)와 Node 테스트용 인메모리 Map을 동일하게 다루기
 * 위한 최소 인터페이스 — apps/mobile의 SqlExecutor와 같은 역할이지만
 * 키오스크 큐는 소량이라 SQL 대신 "키 하나에 JSON 배열 전체"로 충분하다
 * (계획서 §7.1 — IndexedDB/fake-indexeddb 불필요).
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

function readAll(store: KeyValueStore): KioskQueueRow[] {
  const raw = store.get(QUEUE_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as KioskQueueRow[];
  } catch {
    return [];
  }
}

function writeAll(store: KeyValueStore, rows: KioskQueueRow[]): void {
  store.set(QUEUE_STORAGE_KEY, JSON.stringify(rows));
}

export function enqueue(store: KeyValueStore, row: KioskQueueRow): void {
  const rows = readAll(store);
  rows.push(row);
  writeAll(store, rows);
}

export function listPending(store: KeyValueStore): KioskQueueRow[] {
  return readAll(store)
    .filter((r) => r.status === 'PENDING' || r.status === 'FAILED_RETRYABLE')
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));
}

export function countPending(store: KeyValueStore): number {
  return listPending(store).length;
}

export function markStatus(store: KeyValueStore, localIds: string[], status: KioskQueueStatus): void {
  const rows = readAll(store);
  const idSet = new Set(localIds);
  writeAll(
    store,
    rows.map((r) => (idSet.has(r.localId) ? { ...r, status } : r)),
  );
}

export function markSent(store: KeyValueStore, localId: string): void {
  markStatus(store, [localId], 'SENT');
}

export function markFailedRetryable(store: KeyValueStore, localId: string): void {
  const rows = readAll(store);
  writeAll(
    store,
    rows.map((r) => (r.localId === localId ? { ...r, status: 'FAILED_RETRYABLE' as const, attemptCount: r.attemptCount + 1 } : r)),
  );
}
