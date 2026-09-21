import { SECURE_STORE_KEYS, deleteSecureItem, getSecureItem, setSecureItem } from './secureStore';

interface TokenState {
  accessToken: string | null;
  refreshToken: string | null;
}

let state: TokenState = { accessToken: null, refreshToken: null };
const listeners = new Set<(s: TokenState) => void>();

/**
 * api/client.ts(인증헤더 주입·401 재시도)와 auth/AuthContext.tsx(React 상태)
 * 사이의 순환 의존을 피하기 위한 모듈 수준 싱글턴 — client.ts는 React를
 * 몰라도 토큰을 읽고 갱신할 수 있어야 한다.
 */
export const tokenStore = {
  get(): TokenState {
    return state;
  },
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    state = { accessToken, refreshToken };
    await setSecureItem(SECURE_STORE_KEYS.refreshToken, refreshToken);
    listeners.forEach((l) => l(state));
  },
  async clear(): Promise<void> {
    state = { accessToken: null, refreshToken: null };
    await deleteSecureItem(SECURE_STORE_KEYS.refreshToken);
    listeners.forEach((l) => l(state));
  },
  async restoreRefreshToken(): Promise<string | null> {
    const stored = await getSecureItem(SECURE_STORE_KEYS.refreshToken);
    if (stored) state = { ...state, refreshToken: stored };
    return stored;
  },
  subscribe(listener: (s: TokenState) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
