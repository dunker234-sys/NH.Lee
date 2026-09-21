import { punchApi } from '../api/punchApi';
import { ApiError } from '../api/client';
import { runFlush } from './flushLogic';
import { lastSyncTime } from './lastSyncTime';
import { punchQueueRepository } from './punchQueue.repository';

let flushing = false;

/**
 * 계획서 §3.3의 상태기계를 punchQueueRepository/punchApi/lastSyncTime에
 * 고정해 실행하는 얇은 래퍼 — 오케스트레이션 로직 자체는 flushLogic.ts에
 * 있고 여기서는 단일-실행 가드(flushing)와 실제 의존성 배선만 담당한다.
 * 트리거 지점(networkWatcher, App.tsx 마운트/포그라운드, 큐 쓰기 직후)은
 * 전부 이 trigger()만 호출하면 된다.
 */
async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await runFlush({
      queue: punchQueueRepository,
      api: {
        create: punchApi.create,
        createBulk: punchApi.createBulk,
        isRecoverableApiError: (e) => e instanceof ApiError,
      },
      syncTime: lastSyncTime,
      toCreatePunchInput: punchQueueRepository.toCreatePunchInput,
    });
  } finally {
    flushing = false;
  }
}

export const flushService = {
  /** 실패해도(오프라인 등) 호출부는 신경 쓰지 않는다 — 상태는 큐 행 자체가 들고 있다. */
  trigger(): void {
    void flush();
  },
};
