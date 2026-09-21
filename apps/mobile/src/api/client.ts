import Constants from 'expo-constants';
import { tokenStore } from '../auth/tokenStore';

const API_BASE_URL: string = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API 오류 ${status}`);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  // /auth/login, /auth/refresh처럼 아직 토큰이 없거나 만료된 토큰으로
  // 인증헤더를 넣으면 안 되는 요청에 사용한다.
  skipAuth?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function rawFetch(path: string, options: RequestOptions, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!options.skipAuth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

// /auth/refresh 자체는 apiFetch를 순환 호출하지 않도록 client.ts 안에서
// 직접 fetch한다(authApi.refresh()가 이 함수를 쓴다).
export async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await rawFetch('/auth/refresh', { method: 'POST', body: { refreshToken }, skipAuth: true }, null);
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return res.json();
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 인증헤더 자동 주입 + 401 발생 시 리프레시 1회 후 원 요청 1회 재시도.
 * 정상 흐름에서는 AuthContext의 사전 갱신 타이머가 만료 전에 미리 갱신해
 * 이 401 경로를 타지 않는 것이 원칙이지만(계획서 §7.3 — 타각 도중 401을
 * 만나지 않게), 타이머가 놓친 경계 상황을 위한 안전망으로 둔다.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, refreshToken } = tokenStore.get();
  let res = await rawFetch(path, options, accessToken);

  if (res.status === 401 && !options.skipAuth && refreshToken) {
    try {
      const refreshed = await refreshTokens(refreshToken);
      await tokenStore.setTokens(refreshed.accessToken, refreshed.refreshToken);
      res = await rawFetch(path, options, refreshed.accessToken);
    } catch {
      await tokenStore.clear();
      throw new ApiError(401, null);
    }
  }

  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  if (res.status === 204) return undefined as T;
  return res.json();
}
