import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ColorPalette, FontScaleStep, HIGH_CONTRAST_PALETTE, LIGHT_PALETTE, fontSize } from '../theme/tokens';

const STORAGE_KEY = 'accessibility_prefs_v1';

interface StoredPrefs {
  fontScale: FontScaleStep;
  highContrast: boolean;
}

const DEFAULT_PREFS: StoredPrefs = { fontScale: 1.0, highContrast: false };

interface AccessibilityPrefsValue extends StoredPrefs {
  palette: ColorPalette;
  setFontScale: (scale: FontScaleStep) => void;
  setHighContrast: (enabled: boolean) => void;
  fs: (base: number) => number;
}

const AccessibilityPrefsContext = createContext<AccessibilityPrefsValue | null>(null);

export function AccessibilityPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<StoredPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<StoredPrefs>) });
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return; // 초기 로드 전에는 기본값을 되써서 저장값을 덮어쓰지 않는다.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {
      // 저장 실패해도 이번 세션 내 설정은 메모리에 유지되므로 사용자 경험에는 영향 없음.
    });
  }, [prefs, loaded]);

  const value = useMemo<AccessibilityPrefsValue>(
    () => ({
      ...prefs,
      palette: prefs.highContrast ? HIGH_CONTRAST_PALETTE : LIGHT_PALETTE,
      setFontScale: (fontScale) => setPrefs((p) => ({ ...p, fontScale })),
      setHighContrast: (highContrast) => setPrefs((p) => ({ ...p, highContrast })),
      fs: (base) => fontSize(base, prefs.fontScale),
    }),
    [prefs],
  );

  return <AccessibilityPrefsContext.Provider value={value}>{children}</AccessibilityPrefsContext.Provider>;
}

export function useAccessibilityPrefs(): AccessibilityPrefsValue {
  const ctx = useContext(AccessibilityPrefsContext);
  if (!ctx) throw new Error('useAccessibilityPrefs는 AccessibilityPrefsProvider 내부에서만 호출할 수 있다');
  return ctx;
}
