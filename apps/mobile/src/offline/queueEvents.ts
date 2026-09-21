type Listener = () => void;

/**
 * 큐 상태(SQLite)가 바뀔 때마다 알리는 아주 작은 이벤트 버스 — 오프라인
 * 큐는 전역 스토어 라이브러리로 관리하지 않기로 했으므로(계획서 §2),
 * useQueueStatus() 훅이 이걸 구독해 재렌더링을 트리거한다. 데이터 자체는
 * 여기 담지 않는다 — 신호만 보내고, 실제 값은 항상 SQLite에서 다시 읽는다.
 */
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
