import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import ko, { StringKey } from './strings.ko';
import en from './strings.en';
import vi from './strings.vi';

export const SUPPORTED_LOCALES = ['ko', 'en', 'vi'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const STORAGE_KEY = 'locale_override_v1';

// ko가 필수 키셋 — en/vi는 부분집합만 채우고 나머지는 ko로 폴백한다. 서버
// notification-types.registry.ts의 "ko 필수 + 폴백" 규칙과 의도적으로 같은
// 결이다: 클라이언트가 요청할 수 있는 로케일과 서버가 실제로 렌더링하는
// 로케일이 항상 같은 규칙으로 좁혀지므로, 클라이언트가 en을 기대했는데
// 서버는 ko를 보내는 식의 불일치가 생기지 않는다.
const TABLES: Record<Locale, Partial<Record<StringKey, string>>> = { ko, en, vi };

function detectInitialLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode ?? 'ko';
  return (SUPPORTED_LOCALES as readonly string[]).includes(tag) ? (tag as Locale) : 'ko';
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) setLocaleState(stored as Locale);
    });
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const value = useMemo<LocaleContextValue>(() => {
    const table = TABLES[locale];
    const t = (key: StringKey, vars?: Record<string, string | number>) => interpolate(table[key] ?? ko[key], vars);
    return { locale, setLocale, t };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale은 LocaleProvider 내부에서만 호출할 수 있다');
  return ctx;
}
