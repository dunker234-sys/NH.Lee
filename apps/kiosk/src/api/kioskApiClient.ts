const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';
const CREDENTIAL_HEADER = 'X-Kiosk-Device-Credential';

export class KioskApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`키오스크 API 오류 ${status}`);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  credential?: string;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** 얇은 fetch 래퍼 — 모든 인증 요청 헤더는 X-Kiosk-Device-Credential 하나뿐이다
 * (일반 직원 JWT 파이프라인을 쓰지 않는다, apps/api의 KioskDeviceGuard와 대칭). */
export async function kioskApiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.credential) headers[CREDENTIAL_HEADER] = options.credential;

  const res = await fetch(new URL(path, API_BASE_URL), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) throw new KioskApiError(res.status, await safeJson(res));
  return res.json();
}
