/**
 * 모든 시간 계산은 정수 분으로만 한다(CLAUDE.md 절대 규칙 6). 이 파일 밖에서
 * Date 차이를 직접 나눗셈하지 않는다 — 전부 이 헬퍼를 거친다.
 */

/** 두 ISO 인스턴트의 차이를 정수 분으로 반환한다(내림). 음수면 그대로 음수. */
export function diffMinutes(startIso: string, endIso: string): number {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  return Math.floor((endMs - startMs) / 60000);
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60000).toISOString();
}

export function isBefore(aIso: string, bIso: string): boolean {
  return Date.parse(aIso) < Date.parse(bIso);
}

export function isAfterOrEqual(aIso: string, bIso: string): boolean {
  return Date.parse(aIso) >= Date.parse(bIso);
}
