// CorrectionPolicyResolverService(apps/api/src/common/policy/correction-policy-resolver.service.ts)가
// 요구하는 policy_config 기본값. STEP8 정정 신청 기한·2차 승인 요건 전용 키만
// 담는다. dev seed 스크립트와 e2e 픽스처가 이 배열을 함께 쓴다.
export const CORRECTION_POLICY_DEFAULTS: { key: string; value: number }[] = [
  { key: 'correctionRequestDeadlineDaysAfterMonthEnd', value: 10 }, // 근로일이 속한 달 종료 후 10일까지 신청 가능
  { key: 'correctionRequiresSecondApproval', value: 1 }, // 기본은 권역/HQ 2차 승인 필요(0이면 1차로 최종 승인)
];

export const CORRECTION_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
