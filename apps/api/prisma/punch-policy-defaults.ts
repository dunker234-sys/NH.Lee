// STEP4: PunchPolicyResolverService/FraudDetectionService가 요구하는
// policy_config 값 전체. seed.ts에 이미 있는 값과 이름/값이 같지만, 이 모듈은
// (1) e2e 테스트 픽스처(test/fixtures.ts의 loadPunchPolicyConfigFixture)와
// (2) 이미 시드된 dev/test DB에 STEP4 신규 키만 채우는 seed-punch-policy.ts가
// 공유하는 단일 출처다 — 두 곳에 따로 하드코딩하지 않는다.
//
// 의도적으로 쓰지 않는 기존 키: `punch_dedup_window_seconds`(결정적 멱등키만으로
// 완료조건을 만족해 미사용), `geofence_default_radius_m`(Site.geofenceRadiusM이
// 단일 진실 소스라 미사용) — 여기 포함하지 않는다.
export const PUNCH_POLICY_DEFAULTS: { key: string; value: unknown }[] = [
  { key: 'geofence_accuracy_threshold_m', value: 50 },
  { key: 'qr_totp_period_seconds', value: 60 },
  { key: 'qr_verification_policy', value: 'NFC_ONLY' },
  { key: 'offline_queue_delay_threshold_hours', value: 12 },
  { key: 'impossible_travel_speed_kmh', value: 150 },
  { key: 'repeated_coordinate_lookback_days', value: 7 },
  { key: 'repeated_coordinate_max_count', value: 3 },
  { key: 'shared_device_lookback_hours', value: 24 },
  { key: 'device_clock_rollback_tolerance_seconds', value: 5 },
  { key: 'online_punch_delay_threshold_minutes', value: 5 },
  { key: 'location_retention_days', value: 30 },
];

export const PUNCH_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
