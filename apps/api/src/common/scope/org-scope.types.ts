/**
 * 조직 스코프. HQ_HR/ADMIN/SYSTEM의 "전체" 권한은 ALL이라는 명시적 값으로
 * 표현한다 — undefined/null(스코프 누락)과 절대 혼동되면 안 된다.
 */
export type OrgScope = { kind: 'ALL' } | { kind: 'SITES'; siteIds: string[] };

export function allScope(): OrgScope {
  return { kind: 'ALL' };
}

export function sitesScope(siteIds: string[]): OrgScope {
  return { kind: 'SITES', siteIds: [...new Set(siteIds)] };
}
