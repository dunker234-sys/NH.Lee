// HrSyncPolicyResolverService(apps/api/src/common/policy/hr-sync-policy-resolver.service.ts)가
// 요구하는 policy_config 기본값. 법령 수치는 아니지만, 지오펜스 반경·부정사용
// 임계값 등 기존 운영 임계값과 동일하게 policy_config에서만 읽는다
// (CLAUDE.md 절대 규칙4 — 코드 상수화 금지 원칙을 운영 임계값에도 일관 적용).
export const HR_SYNC_POLICY_DEFAULTS: { key: string; value: number }[] = [
  // 한 배치에서 전체 재직 인원 대비 (신규+변경+퇴사) 비율이 이 값 이상이면
  // 자동 적용하지 않고 관리자 확인을 요구한다(요구사항서 5장③).
  { key: 'hrSyncAutoApplyChangeRatioThreshold', value: 0.1 },
];

export const HR_SYNC_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
