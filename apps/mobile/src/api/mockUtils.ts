/** 목업 API 공용 유틸 — 인위적 지연(로딩 상태 UI를 정직하게 노출)과
 * employeeNo로 시드된 결정적 난수(같은 계정은 재실행해도 같은 데모 데이터를 본다). */
export function sleep(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** 시드 기반 [0,1) 의사난수 생성기(mulberry32) — employeeNo가 같으면 항상 같은 시퀀스. */
export function seededRandom(seed: string): () => number {
  let a = hashString(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
