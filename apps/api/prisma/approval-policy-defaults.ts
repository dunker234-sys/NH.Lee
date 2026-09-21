// ApprovalPolicyResolverService(apps/api/src/common/policy/approval-policy-resolver.service.ts)가
// 요구하는 policy_config 기본값. STEP6.5 조기출근 반복 패턴 탐지 전용 키만
// 담는다. dev seed 스크립트와 e2e 픽스처가 이 배열을 함께 쓴다.
export const APPROVAL_POLICY_DEFAULTS: { key: string; value: number }[] = [
  { key: 'earlyClockInMinutesThreshold', value: 10 }, // 스케줄 시작보다 N분 이상 이르면 "조기"
  { key: 'earlyClockInMonthlyOccurrenceThreshold', value: 3 }, // 월 N회 이상이면 플래그
];

export const APPROVAL_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
