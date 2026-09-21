// PayrollPolicyResolverService/PayrollValidationPolicyResolverService가 요구하는
// policy_config 신규 키만 채운다. overtimePremiumRate 등 4개는 STEP3에서 이미
// seed됐고 consecutiveWorkdayLimitDays는 STEP6에서 이미 seed됐으므로 여기서
// 다시 넣지 않는다 — 이 파일은 STEP11이 실제로 추가하는 키만 다룬다.
export const PAYROLL_POLICY_DEFAULTS: { key: string; value: number }[] = [
  // 월급제 통상시급 산정 기준 시간(분). 관행상 209시간(주40h+주휴 포함 월평균
  // 소정근로시간) = 12,540분.
  { key: 'monthlyOrdinaryWageDivisorMinutes', value: 12540 },
  // 마감 전 자동 검증: 월 근로시간이 이 값을 넘으면 이상치로 본다(참고용 임계치).
  { key: 'monthlyHoursOutlierThresholdMinutes', value: 15600 }, // 260h
  // 마감 전 자동 검증: 월 연장근로(승인+미승인)가 이 값을 넘으면 과다로 본다.
  { key: 'excessiveOvertimeThresholdMinutes', value: 3120 }, // 52h
];

export const PAYROLL_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
