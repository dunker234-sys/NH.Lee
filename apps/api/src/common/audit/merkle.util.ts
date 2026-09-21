import { sha256 } from '../crypto/hash.util';

/**
 * 표준 페어와이즈 Merkle 루트. 리프는 각 audit_log 행의 record_hash(이미
 * sha256 hex 문자열)다. 홀수 개면 마지막 노드를 복제해 짝을 맞춘다(표준
 * Bitcoin-style 컨벤션). 빈 배열이면 봉인할 게 없다는 뜻으로 null을 반환한다
 * — 이벤트가 없는 시간대는 봉인하지 않는다.
 */
export function computeMerkleRoot(leafHashes: string[]): string | null {
  if (leafHashes.length === 0) return null;

  let level = [...leafHashes];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(sha256(left + right));
    }
    level = next;
  }
  return level[0];
}
