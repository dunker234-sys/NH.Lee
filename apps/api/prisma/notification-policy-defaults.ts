// STEP4.5: NotificationPolicyResolverService가 요구하는 policy_config 값.
// seed.ts에 이미 있는 값과 이름/값이 같지만, 이 모듈은 (1) e2e 테스트 픽스처와
// (2) 이미 시드된 dev/test DB에 STEP4.5 신규 키만 채우는 seed-notification-policy.ts가
// 공유하는 단일 출처다 — 두 곳에 따로 하드코딩하지 않는다.
export const NOTIFICATION_POLICY_DEFAULTS: { key: string; value: unknown }[] = [
  { key: 'notification_quiet_hours_start_minute_of_day', value: 1320 },
  { key: 'notification_quiet_hours_end_minute_of_day', value: 360 },
];

export const NOTIFICATION_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
