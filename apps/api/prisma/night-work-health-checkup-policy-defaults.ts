// NightWorkHealthCheckupPolicyResolverService가 요구하는 policy_config 기본값.
// STEP9 산안법 §130·시행규칙 별표22 제4호(야간작업 특수건강진단 대상자 판정) 전용 키.
// 키는 NightWorkHealthCheckupPolicy 필드명과 1:1로 일치시킨다(PolicyConfigResolverService와 같은 관례).
export const NIGHT_WORK_HEALTH_CHECKUP_POLICY_DEFAULTS: { key: string; value: number }[] = [
  { key: 'criterion1MinConsecutiveMinutes', value: 480 }, // 8h
  { key: 'criterion1MonthlyAvgThreshold', value: 4 },
  { key: 'criterion2MonthlyAvgMinutesThreshold', value: 3600 }, // 60h
  { key: 'monthsInWindow', value: 6 },
  { key: 'criterion1BandStartMinuteOfDay', value: 0 }, // 00:00
  { key: 'criterion1BandEndMinuteOfDay', value: 300 }, // 05:00
  { key: 'criterion2BandStartMinuteOfDay', value: 1320 }, // 22:00
  { key: 'criterion2BandEndMinuteOfDay', value: 360 }, // 06:00
];

export const NIGHT_WORK_HEALTH_CHECKUP_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
