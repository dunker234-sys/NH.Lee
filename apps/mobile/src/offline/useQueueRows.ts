import { useEffect, useState } from 'react';
import { punchQueueRepository, PunchQueueRow } from './punchQueue.repository';
import { queueEvents } from './queueEvents';

/** PunchScreen의 "전송 대기 중인 타각" 목록이 구독한다 — useQueueStatus()와 같은 이벤트 소스, 전체 행을 필요로 할 때 사용. */
export function useQueueRows(): PunchQueueRow[] {
  const [rows, setRows] = useState<PunchQueueRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      punchQueueRepository.listAll().then((r) => {
        if (!cancelled) setRows(r);
      });
    };
    refresh();
    const unsubscribe = queueEvents.subscribe(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return rows;
}
