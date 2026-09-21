type Listener = () => void;

/** apps/mobile과 같은 최소 이벤트 버스 — 큐 상태가 바뀔 때마다 UI에 재렌더링을 알린다. */
const listeners = new Set<Listener>();

export const queueEvents = {
  emitChanged(): void {
    listeners.forEach((l) => l());
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
