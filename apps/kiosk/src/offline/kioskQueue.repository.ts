import * as logic from './kioskQueueLogic';
import { localStorageAdapter } from './storageAdapter';
import type { KioskQueueRow } from './schema';
import { queueEvents } from './queueEvents';

export type { KioskQueueRow } from './schema';

/** kiosk_punch_queue_v1에 대한 이 앱의 유일한 접근 지점. */
export const kioskQueueRepository = {
  async enqueue(row: KioskQueueRow): Promise<void> {
    logic.enqueue(localStorageAdapter, row);
    queueEvents.emitChanged();
  },
  async listPending(): Promise<KioskQueueRow[]> {
    return logic.listPending(localStorageAdapter);
  },
  async countPending(): Promise<number> {
    return logic.countPending(localStorageAdapter);
  },
  async markSending(localIds: string[]): Promise<void> {
    logic.markStatus(localStorageAdapter, localIds, 'SENDING');
    queueEvents.emitChanged();
  },
  async markSent(localId: string): Promise<void> {
    logic.markSent(localStorageAdapter, localId);
    queueEvents.emitChanged();
  },
  async markFailedRetryable(localId: string): Promise<void> {
    logic.markFailedRetryable(localStorageAdapter, localId);
    queueEvents.emitChanged();
  },
};
