const STORAGE_KEY = 'admin_web_session_v1';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  employeeNo: string;
}

/** 최소 부트스트랩(계획서 §8) — localStorage에 직접 저장한다. 토큰
 * 자동 갱신·안전한 보관 전략은 STEP6이 admin-web을 본격적으로 키울 때
 * 다시 설계한다. */
export const authStore = {
  get(): StoredSession | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  },
  set(session: StoredSession): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  },
  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
