// PolicyConfigResolverService(apps/api/src/modules/recalculation/policy-config-resolver.service.ts)가
// 요구하는 policy_config 기본값. dev seed 스크립트와 e2e 픽스처가 이 배열을 함께 쓴다 —
// 두 곳에 따로 하드코딩하면 드리프트가 생긴다.
export const RECALCULATION_POLICY_DEFAULTS: { key: string; value: number }[] = [
  { key: 'dailyStatutoryLimitMinutes', value: 480 },
  { key: 'weeklyStatutoryLimitMinutes', value: 2400 },
  { key: 'weeklyOvertimeCapMinutes', value: 720 },
  { key: 'nightStartMinuteOfDay', value: 1320 },
  { key: 'nightEndMinuteOfDay', value: 360 },
  { key: 'overtimePremiumRate', value: 0.5 },
  { key: 'nightPremiumRate', value: 0.5 },
  { key: 'holidayPremiumRateWithin8h', value: 0.5 },
  { key: 'holidayPremiumRateExcess8h', value: 1.0 },
  { key: 'breakTierThresholdMinutes', value: 240 },
  { key: 'breakTierMinutes', value: 30 },
  { key: 'breakFullTierThresholdMinutes', value: 480 },
  { key: 'breakFullTierMinutes', value: 60 },
  { key: 'ultraPartTimeWeeklyThresholdMinutes', value: 900 },
  { key: 'annualLeaveMinContinuousMonths', value: 12 },
];

export const RECALCULATION_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
