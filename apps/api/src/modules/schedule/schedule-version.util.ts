import { canonicalJson, sha256 } from '../../common/crypto/hash.util';

/**
 * "이 사업장·월의 그리드가 내가 읽은 시점 이후 바뀌었는가"를 판정할
 * 사업장 단위 값. 셀 단위 schedule.version과 별개다(§3.3). 기존
 * AuditLogService의 해시체인과 같은 canonicalJson+sha256 재사용.
 */
export function computeScheduleGridVersion(rows: { id: string; version: number }[]): string {
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id)).map((r) => ({ id: r.id, version: r.version }));
  return sha256(canonicalJson(sorted));
}
