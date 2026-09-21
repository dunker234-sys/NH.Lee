const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** "15m", "14d" 같은 간단한 기간 문자열을 밀리초로 변환한다. */
export function parseDurationMs(input: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) throw new Error(`유효하지 않은 기간 형식입니다: ${input}`);
  return Number(match[1]) * UNIT_MS[match[2]];
}
