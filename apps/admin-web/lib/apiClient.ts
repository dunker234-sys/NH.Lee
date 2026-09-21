import { authStore } from './authStore';

const API_BASE_URL: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API 오류 ${status}`);
  }
}

/** 갱신도 실패해 세션을 더 이상 살릴 수 없을 때(리프레시 토큰 만료/폐기).
 * 호출부가 굳이 매번 처리할 필요는 없다 — apiFetch가 이미 로그인 화면으로
 * 보낸 뒤 이 에러를 던진다(진행 중이던 await 체인을 정리하기 위해서일 뿐). */
export class SessionExpiredError extends Error {}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function rawFetch(path: string, options: RequestOptions, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(new URL(path, API_BASE_URL), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

// 동시에 여러 요청이 401을 맞으면 refresh를 한 번만 태운다 — 그렇지
// 않으면 두 번째 refresh 호출이 첫 번째가 이미 회전시킨(폐기된)
// refreshToken을 다시 제출하게 되고, 서버의 RefreshTokenService는 이를
// 탈취 신호로 보고 그 직원·기기의 세션 체인을 통째로 무효화한다 —
// 동시 요청 자체가 로그아웃을 유발하는 사고를 막기 위한 장치다.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const session = authStore.get();
  if (!session) return null;
  try {
    const res = await rawFetch('/auth/refresh', { method: 'POST', body: { refreshToken: session.refreshToken } });
    if (!res.ok) return null;
    const body = (await res.json()) as { accessToken: string; refreshToken: string };
    authStore.set({ ...session, accessToken: body.accessToken, refreshToken: body.refreshToken });
    return body.accessToken;
  } catch {
    return null;
  }
}

/** 401이면 /auth/refresh 한 번 시도 후 재시도, 그마저 실패하면 세션을
 * 지우고 로그인 화면으로 보낸다. apiFetch(JSON)와 apiFetchMultipart(파일
 * 업로드)가 이 재시도 정책을 공유한다 — 재시도 로직을 두 번 만들면
 * refreshInFlight dedup을 두 곳에서 각각 관리해야 해 동시-401 경합
 * 시나리오가 다시 생긴다. */
async function withAuthRetry(perform: (accessToken?: string) => Promise<Response>): Promise<Response> {
  const session = authStore.get();
  let res = await perform(session?.accessToken);

  if (res.status === 401 && session) {
    refreshInFlight ??= refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
    const newToken = await refreshInFlight;

    if (newToken) {
      res = await perform(newToken);
    } else {
      authStore.clear();
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new SessionExpiredError('세션이 만료되었습니다. 다시 로그인해 주세요.');
    }
  }
  return res;
}

/** 얇은 fetch 래퍼. 토큰은 authStore에서 직접 읽는다 — 호출부가 매번
 * accessToken을 넘길 필요가 없다. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await withAuthRetry((accessToken) => rawFetch(path, options, accessToken));
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** 엑셀 업로드 등 multipart/form-data 전용. Content-Type을 직접 지정하지
 * 않는다 — 브라우저가 boundary를 포함해 자동으로 채운다(직접 지정하면
 * boundary가 빠져 서버가 파싱하지 못한다). */
export async function apiFetchMultipart<T>(path: string, formData: FormData): Promise<T> {
  const res = await withAuthRetry((accessToken) => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(new URL(path, API_BASE_URL), { method: 'POST', headers, body: formData });
  });
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return res.json();
}
