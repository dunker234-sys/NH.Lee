// SchedulePolicyResolverService(apps/api/src/common/policy/schedule-policy-resolver.service.ts)가
// 요구하는 policy_config 기본값 중, recalculation-policy-defaults.ts가 아직
// 시딩하지 않는 스케줄 전용 키만 담는다. dailyStatutoryLimitMinutes/
// weeklyStatutoryLimitMinutes/weeklyOvertimeCapMinutes/breakTier*는
// SchedulePolicyResolverService도 읽지만, recalculation-policy-defaults.ts가
// 이미 전사 기본값(같은 key+effectiveStartDate)으로 시딩해 뒀으므로 여기서
// 다시 넣지 않는다 — 넣으면 policy_config의 (key, effective_start_date)
// WHERE site_id IS NULL 부분 유니크 인덱스에 걸려 충돌한다. dev seed
// 스크립트와 e2e 픽스처가 이 배열을 함께 쓴다.
export const SCHEDULE_POLICY_DEFAULTS: { key: string; value: number }[] = [
  { key: 'biweeklyWeeklyCapMinutes', value: 2880 }, // §51① 48h
  { key: 'extendedWeeklyCapMinutes', value: 3120 }, // §51의2① 52h
  { key: 'extendedDailyCapMinutes', value: 720 }, // 12h
  { key: 'continuousRestMinutes', value: 660 }, // §51의2② 11h
  { key: 'semiannualNoticeDaysBefore', value: 14 },
  { key: 'selectiveMonthlyOvertimePremiumRate', value: 0.5 },
  { key: 'consecutiveWorkdayLimitDays', value: 6 }, // STEP6 신규
];

export const SCHEDULE_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');
