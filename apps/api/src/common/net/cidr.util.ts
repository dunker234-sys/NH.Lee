/**
 * IP 허용목록(SiteIpAllowlist) 판정용 순수 유틸. IPv4만 지원한다(요구사항
 * 범위가 사무실 대역 허용목록이라 IPv6까지 다룰 필요가 없다). totp.util.ts/
 * haversine.util.ts와 같은 결 — 의존성 없는 손수 구현, 독립 테스트 가능.
 */

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** "a.b.c.d" → 32비트 부호없는 정수. 형식이 잘못되면 null(허용이 아니라 항상 거부로 취급되게). */
export function ipToInt(ip: string): number | null {
  const match = IPV4_PATTERN.exec(ip.trim());
  if (!match) return null;
  const octets = match.slice(1, 5).map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

export interface ParsedCidr {
  base: number;
  prefixLength: number;
}

/** "a.b.c.d/n" 파싱. 잘못된 CIDR 문자열이면 throw — 쓰기 시점에 조용히
 * 무의미해지는 잘못된 허용목록 항목이 생기지 않게 한다. */
export function parseCidr(cidr: string): ParsedCidr {
  const [ipPart, prefixPart] = cidr.trim().split('/');
  if (!ipPart || prefixPart === undefined) {
    throw new Error(`잘못된 CIDR 형식입니다: '${cidr}'`);
  }
  const prefixLength = Number(prefixPart);
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
    throw new Error(`잘못된 CIDR prefix 길이입니다: '${cidr}'`);
  }
  const base = ipToInt(ipPart);
  if (base === null) {
    throw new Error(`잘못된 CIDR 형식입니다: '${cidr}'`);
  }
  return { base, prefixLength };
}

function maskFor(prefixLength: number): number {
  if (prefixLength === 0) return 0;
  return (0xffffffff << (32 - prefixLength)) >>> 0;
}

/** ip가 파싱 불가면(IPv4가 아니면) 항상 false — "판정 불가"를 "허용"으로
 * 흘려보내지 않는다. */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const target = ipToInt(ip);
  if (target === null) return false;
  const { base, prefixLength } = parseCidr(cidr);
  const mask = maskFor(prefixLength);
  return (target & mask) === (base & mask);
}
