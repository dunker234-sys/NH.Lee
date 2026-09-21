// STEP5-B: KioskPolicyResolverService가 요구하는 policy_config 값.
export const KIOSK_POLICY_DEFAULTS: { key: string; value: unknown }[] = [
  { key: 'kiosk_pin_max_failed_attempts', value: 5 },
  { key: 'kiosk_pin_lockout_minutes', value: 15 },
];

export const KIOSK_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
