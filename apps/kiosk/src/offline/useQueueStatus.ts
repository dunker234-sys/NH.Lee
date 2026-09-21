import { useEffect, useState } from 'react';
import { kioskQueueRepository } from './kioskQueue.repository';
import { queueEvents } from './queueEvents';

export function useQueueStatus(): { pendingCount: number } {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      kioskQueueRepository.countPending().then((n) => {
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
