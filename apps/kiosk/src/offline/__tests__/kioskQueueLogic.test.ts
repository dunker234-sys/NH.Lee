import { countPending, enqueue, listPending, markFailedRetryable, markSent, markStatus } from '../kioskQueueLogic';
import type { KioskQueueRow } from '../schema';
import { createMemoryStore } from './memoryStore';

function baseRow(overrides: Partial<KioskQueueRow> = {}): KioskQueueRow {
  return {
    localId: 'local-1',
    employeeNo: 'EMP-1',
    pinCiphertext: 'iv-b64:ciphertext-b64',
    punchType: 'IN',
    recordedAt: '2026-08-28T00:00:00.000Z',
    clientEventId: 'client-event-1',
    status: 'PENDING',
    attemptCount: 0,
    createdAt: '2026-08-28T00:00:00.100Z',
    ...overrides,
  };
}

describe('kioskQueueLogic — 오프라인 큐 순수 로직', () => {
  it('enqueue한 행은 PENDING 상태로 listPending에 나타난다', () => {
    const store = createMemoryStore();
    enqueue(store, baseRow());
    const pending = listPending(store);
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('PENDING');
  });

  it('재전송(재시도) 시에도 recordedAt/clientEventId/pinCiphertext가 최초 값과 완전히 동일하다', () => {
    const store = createMemoryStore();
    enqueue(store, baseRow());
    const firstAttempt = listPending(store)[0];

    markFailedRetryable(store, 'local-1');
    const secondAttempt = listPending(store)[0];

    expect(secondAttempt.recordedAt).toBe(firstAttempt.recordedAt);
    expect(secondAttempt.clientEventId).toBe(firstAttempt.clientEventId);
    expect(secondAttempt.pinCiphertext).toBe(firstAttempt.pinCiphertext);
  });

  it('FAILED_RETRYABLE 행은 attemptCount가 증가하고 다시 listPending에 잡힌다', () => {
    const store = createMemoryStore();
    enqueue(store, baseRow());
    markFailedRetryable(store, 'local-1');
    const pending = listPending(store);
    expect(pending[0].status).toBe('FAILED_RETRYABLE');
    expect(pending[0].attemptCount).toBe(1);
  });

  it('markSent 이후에는 listPending에서 사라지고 countPending이 0이 된다', () => {
    const store = createMemoryStore();
    enqueue(store, baseRow());
    markSent(store, 'local-1');
    expect(listPending(store)).toHaveLength(0);
    expect(countPending(store)).toBe(0);
  });

  it('여러 행은 recordedAt 오름차순으로 반환된다', () => {
    const store = createMemoryStore();
    enqueue(store, baseRow({ localId: 'b', recordedAt: '2026-08-28T02:00:00.000Z', clientEventId: 'ce-b' }));
    enqueue(store, baseRow({ localId: 'a', recordedAt: '2026-08-28T01:00:00.000Z', clientEventId: 'ce-a' }));
    const pending = listPending(store);
    expect(pending.map((r) => r.localId)).toEqual(['a', 'b']);
  });

  it('SENDING 상태인 행은 listPending에서 제외된다', () => {
    const store = createMemoryStore();
    enqueue(store, baseRow());
    markStatus(store, ['local-1'], 'SENDING');
    expect(listPending(store)).toHaveLength(0);
  });
});
