import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EmployeePrincipal, authApi } from '../api/authApi';
import { currentPrincipalStore } from './currentPrincipalStore';
import { getOrCreateDeviceId } from './deviceId';
import { isBiometricEnrolledForApp, promptBiometric } from './biometric';
import { tokenStore } from './tokenStore';

export type AuthStatus =
  | 'LOADING'
  | 'UNAUTHENTICATED'
  | 'NEEDS_BIOMETRIC'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'AUTHENTICATED';

// 액세스 토큰 TTL 기본값(15분, apps/api/.env ACCESS_TOKEN_TTL)보다 여유 있게
// 앞당겨 갱신한다 — 정확한 만료 시각을 서버가 알려주지 않으므로 고정값을
// 쓴다. 이 창을 놓쳐도 api/client.ts의 401→재시도 안전망이 있다.
const PROACTIVE_REFRESH_INTERVAL_MS = 13 * 60 * 1000;

interface AuthContextValue {
  status: AuthStatus;
  principal: EmployeePrincipal | null;
  deviceId: string;
  login: (employeeNo: string, password: string) => Promise<void>;
  loginWithBiometric: (reason: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('LOADING');
  const [principal, setPrincipalState] = useState<EmployeePrincipal | null>(null);
  function setPrincipal(p: EmployeePrincipal | null) {
    setPrincipalState(p);
    currentPrincipalStore.set(p); // 목업 API 시드용(currentPrincipalStore.ts 주석 참고)
  }
  const [deviceId, setDeviceId] = useState<string>('');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleProactiveRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      const { refreshToken } = tokenStore.get();
      if (!refreshToken) return;
      try {
        const refreshed = await authApi.refresh(refreshToken);
        await tokenStore.setTokens(refreshed.accessToken, refreshed.refreshToken);
        scheduleProactiveRefresh();
      } catch {
        // 조용히 실패 — 다음 API 호출이 401→재시도 경로를 타거나, 사용자가
        // 다음 콜드 실행 때 재로그인하게 된다.
      }
    }, PROACTIVE_REFRESH_INTERVAL_MS);
  }

  async function loadSessionAndSettle() {
    const { principal: p } = await authApi.getSession();
    setPrincipal(p);
    setStatus(p.status === 'ACTIVE' ? 'AUTHENTICATED' : 'AUTHENTICATED'); // 계정 상태(휴직 등) UI 처리는 화면단 책임
    scheduleProactiveRefresh();
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getOrCreateDeviceId();
      if (cancelled) return;
      setDeviceId(id);

      const storedRefreshToken = await tokenStore.restoreRefreshToken();
      if (!storedRefreshToken) {
        setStatus('UNAUTHENTICATED');
        return;
      }

      const biometricEnrolled = await isBiometricEnrolledForApp();
      if (biometricEnrolled) {
        // 생체인증 게이트가 refreshToken 사용 자체를 잠근다 — 여기서 미리
        // refresh를 시도하지 않는다(계획서 §7.3).
        setStatus('NEEDS_BIOMETRIC');
        return;
      }

      try {
        const refreshed = await authApi.refresh(storedRefreshToken);
        await tokenStore.setTokens(refreshed.accessToken, refreshed.refreshToken);
        // mustChangePassword는 로그인 응답에만 실려온다 — session이 유일한
        // 진짜 확인 지점이라 여기서 다시 조회해야 한다.
        const { principal: p } = await authApi.getSession();
        if (cancelled) return;
        setPrincipal(p);
        setStatus('AUTHENTICATED');
        scheduleProactiveRefresh();
      } catch {
        if (cancelled) return;
        await tokenStore.clear();
        setStatus('UNAUTHENTICATED');
      }
    })();
    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      principal,
      deviceId,
      async login(employeeNo, password) {
        const result = await authApi.login({ employeeNo, password, deviceId });
        await tokenStore.setTokens(result.accessToken, result.refreshToken);
        if (result.mustChangePassword) {
          setStatus('PASSWORD_CHANGE_REQUIRED');
          const { principal: p } = await authApi.getSession();
          setPrincipal(p);
          return;
        }
        await loadSessionAndSettle();
      },
      async loginWithBiometric(reason) {
        const ok = await promptBiometric(reason);
        if (!ok) return false;
        const storedRefreshToken = tokenStore.get().refreshToken ?? (await tokenStore.restoreRefreshToken());
        if (!storedRefreshToken) return false;
        try {
          const refreshed = await authApi.refresh(storedRefreshToken);
          await tokenStore.setTokens(refreshed.accessToken, refreshed.refreshToken);
          const { principal: p } = await authApi.getSession();
          setPrincipal(p);
          setStatus(p ? 'AUTHENTICATED' : 'UNAUTHENTICATED');
          scheduleProactiveRefresh();
          return true;
        } catch {
          return false;
        }
      },
      async changePassword(currentPassword, newPassword) {
        await authApi.changePassword(currentPassword, newPassword);
        await loadSessionAndSettle();
      },
      async logout() {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        await tokenStore.clear();
        setPrincipal(null);
        setStatus('UNAUTHENTICATED');
      },
    }),
    [status, principal, deviceId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 호출할 수 있다');
  return ctx;
}
