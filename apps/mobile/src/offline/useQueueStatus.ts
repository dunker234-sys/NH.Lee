import { useEffect, useState } from 'react';
import { punchQueueRepository } from './punchQueue.repository';
import { queueEvents } from './queueEvents';

export interface QueueStatus {
  pendingCount: number;
}

/**
 * 홈 헤더의 동기화 상태 표시(계획서 §4)가 구독하는 훅. 로컬 알림은 넛지일
 * 뿐이고, 이 훅이 SQLite `status` 컬럼을 직접 읽는 것이 진실의 원천이다.
 */
export function useQueueStatus(): QueueStatus {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      punchQueueRepository.countPending().then((n) => {
        if (!cancelled) setPendingCount(n);
      });
    };
    refresh();
    const unsubscribe = queueEvents.subscribe(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { pendingCount };
}
