import * as Crypto from 'expo-crypto';
import { PunchQueueRow } from './schema';
import { sqlExecutor } from './db';
import * as logic from './punchQueueLogic';
import { EnqueuePunchInput } from './punchQueueLogic';
import { queueEvents } from './queueEvents';

export type { PunchQueueRow } from './schema';

/**
 * punch_queue에 대한 이 앱의 유일한 접근 지점. logic 함수를 실제 db(sqlExecutor)에
 * 고정해 호출하고, 쓰기 작업마다 queueEvents로 알린다 — 화면은 이 모듈만
 * import하면 되고, punchQueueLogic.ts를 직접 알 필요가 없다.
 */
export const punchQueueRepository = {
  async enqueue(input: Omit<EnqueuePunchInput, 'localId' | 'clientEventId' | 'createdAt'>): Promise<string> {
    const localId = Crypto.randomUUID();
    await logic.enqueuePunch(sqlExecutor, {
      ...input,
      localId,
      // local_id와 함께 1회 생성 — 이후 재전송에서 재사용한다(서버는 이
      // 값으로 멱등 판정을 하지 않지만, 추적용 id가 재전송마다 바뀌면
      // 서버 쪽 로그 상관관계 추적이 어려워진다).
      clientEventId: Crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    queueEvents.emitChanged();
    return localId;
  },

  listPending(): Promise<PunchQueueRow[]> {
    return logic.listPending(sqlExecutor);
  },

  listAll(): Promise<PunchQueueRow[]> {
    return logic.listAll(sqlExecutor);
  },

  countPending(): Promise<number> {
    return logic.countPending(sqlExecutor);
  },

  async markSending(localIds: string[]): Promise<void> {
    await logic.markStatus(sqlExecutor, localIds, 'SENDING');
    queueEvents.emitChanged();
  },

  async markSent(localId: string, serverPunchId: string, serverVerificationLevel: string): Promise<void> {
    await logic.markSent(sqlExecutor, localId, serverPunchId, serverVerificationLevel);
    queueEvents.emitChanged();
  },

  async markFailedRetryable(localId: string): Promise<void> {
    await logic.markFailedRetryable(sqlExecutor, localId, new Date().toISOString());
    queueEvents.emitChanged();
  },

  toCreatePunchInput: logic.toCreatePunchInput,
};
