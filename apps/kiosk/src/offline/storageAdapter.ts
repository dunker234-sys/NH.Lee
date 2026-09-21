import type { KeyValueStore } from './kioskQueueLogic';

/** localStorage를 KeyValueStore로 감싼다 — 브라우저 런타임에서만 쓰인다. */
export const localStorageAdapter: KeyValueStore = {
  get(key) {
    return localStorage.getItem(key);
  },
  set(key, value) {
    localStorage.setItem(key, value);
  },
};
