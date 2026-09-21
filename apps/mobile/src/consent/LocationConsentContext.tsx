import { ConsentRecord } from '@attendance/shared-types';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { consentApi } from '../api/consentApi';
import { useAuth } from '../auth/AuthContext';

interface LocationConsentValue {
  current: ConsentRecord | null;
  history: ConsentRecord[];
  loading: boolean;
  /** GPS 타각 사용 가능 여부 — AGREED일 때만 true. PAUSED/WITHDRAWN/기록없음은
   * 전부 "GPS 사용 불가, NFC/QR로 유도"로 동일하게 취급한다(계획서 §5.2). */
  canUseGps: boolean;
  refresh: () => Promise<void>;
  agree: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  withdraw: () => Promise<void>;
}

const LocationConsentContext = createContext<LocationConsentValue | null>(null);

export function LocationConsentProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus } = useAuth();
  const [current, setCurrent] = useState<ConsentRecord | null>(null);
  const [history, setHistory] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // /consent/*는 인증이 필요한 엔드포인트다 — 로그인 전에는 조회를 시도조차 하지 않는다.
    if (authStatus !== 'AUTHENTICATED' && authStatus !== 'PASSWORD_CHANGE_REQUIRED') return;
    setLoading(true);
    try {
      const s = await consentApi.getStatus();
      setCurrent(s.current);
      setHistory(s.history);
    } catch {
      // 일시적 오류는 canUseGps=false(가장 보수적인 기본값)로 남겨 GPS를 강제하지 않는다.
    } finally {
      setLoading(false);
    }
  }, [authStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<LocationConsentValue>(
    () => ({
      current,
      history,
      loading,
      canUseGps: current?.status === 'AGREED',
      refresh,
      async agree() {
        await consentApi.agree();
        await refresh();
      },
      async pause() {
        await consentApi.pause();
        await refresh();
      },
      async resume() {
        await consentApi.agree(); // 재개는 새 AGREED 행 — pause 행을 재사용하지 않는다(계획서 §5.3)
        await refresh();
      },
      async withdraw() {
        await consentApi.withdraw();
        await refresh();
      },
    }),
    [current, history, loading, refresh],
  );

  return <LocationConsentContext.Provider value={value}>{children}</LocationConsentContext.Provider>;
}

export function useLocationConsent(): LocationConsentValue {
  const ctx = useContext(LocationConsentContext);
  if (!ctx) throw new Error('useLocationConsent은 LocationConsentProvider 내부에서만 호출할 수 있다');
  return ctx;
}
