// WeeklyAlertPolicyResolverService(apps/api/src/common/policy/weekly-alert-policy-resolver.service.ts)가
// 요구하는 policy_config 기본값. STEP9 52시간 알림 임계값(요구사항서 4.4②) 전용 키만
// 담는다. dev seed 스크립트와 e2e 픽스처가 이 배열을 함께 쓴다.
// 키는 WeeklyAlertThresholdPolicy 필드명과 1:1로 일치시킨다(PolicyConfigResolverService와
// 같은 관례). weeklyOvertimeCapMinutes는 RECALCULATION_POLICY_DEFAULTS가 이미 심는
// 같은 이름의 키를 그대로 재사용하므로 여기서 중복 정의하지 않는다.
export const WEEKLY_ALERT_POLICY_DEFAULTS: { key: string; value: number }[] = [
  { key: 'attentionAbsoluteMinutes', value: 2700 }, // 45h
  { key: 'attentionRelativeRatio', value: 0.7 },
  { key: 'warningAbsoluteMinutes', value: 2880 }, // 48h
  { key: 'warningRelativeRatio', value: 0.85 },
  { key: 'dangerAbsoluteMinutes', value: 3000 }, // 50h
  { key: 'dangerRelativeRatio', value: 0.95 },
];

export const WEEKLY_ALERT_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
