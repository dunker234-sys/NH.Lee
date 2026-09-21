// STEP5-A: ConsentPolicyResolverService가 요구하는 policy_config 값 중
// 이번 STEP에서 새로 정의하는 키만 담는다. `location_retention_days`는
// punch-policy-defaults.ts가 이미 소유한 키라 여기서 다시 정의하지
// 않는다(두 곳에서 같은 키를 따로 관리하면 드리프트 위험) — 리졸버가
// 두 출처의 policy_config 행을 함께 조회할 뿐이다.
export const CONSENT_POLICY_DEFAULTS: { key: string; value: unknown }[] = [
  { key: 'location_consent_policy_version', value: 'v1' },
];

export const CONSENT_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
