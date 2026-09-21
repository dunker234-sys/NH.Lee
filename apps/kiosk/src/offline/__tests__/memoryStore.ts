import type { KeyValueStore } from '../kioskQueueLogic';

/** localStorage 대신 쓰는 순수 인메모리 페이크 — 시뮬레이터/브라우저 없이 검증한다. */
export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get(key) {
      return map.get(key) ?? null;
    },
    set(key, value) {
      map.set(key, value);
    },
  };
}
