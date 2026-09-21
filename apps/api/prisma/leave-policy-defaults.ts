// LeavePolicyResolverService(apps/api/src/common/policy/leave-policy-resolver.service.ts)가
// 요구하는 policy_config 기본값. STEP7 연차 발생(§60)/촉진(§61) 전용 키만
// 담는다. annualLeaveMinContinuousMonths/ultraPartTimeWeeklyThresholdMinutes는
// recalculation-policy-defaults.ts가 이미 시딩했으므로 여기서 다시 넣지
// 않는다 — 넣으면 policy_config의 (key, effective_start_date) WHERE
// site_id IS NULL 부분 유니크 인덱스에 걸려 충돌한다. dev seed 스크립트와
// e2e 픽스처가 이 배열을 함께 쓴다.
//
// article61* 값은 근로기준법 §61의 법정 최소 기한과 정확히 같다
// (packages/core-rules의 leave/promotion/promotion-constants.ts의
// ARTICLE_61_STATUTORY_LIMITS와 동일값) — 회사가 이보다 이르게 조정하려면
// PUT /admin/leave/promotion-policy로 새 policy_config 행을 만들면 된다.
export const LEAVE_POLICY_DEFAULTS: { key: string; value: number }[] = [
  { key: 'annualLeaveBaseDays', value: 15 },
  { key: 'annualLeaveMaxCapDays', value: 25 },
  { key: 'annualLeaveSeniorityIntervalYears', value: 2 },
  { key: 'annualLeaveMonthlyAccrualMaxMonths', value: 11 },
  { key: 'annualLeaveAttendanceRateThresholdPercent', value: 80 },
  { key: 'article611FirstNoticeWindowDays', value: 10 },
  { key: 'article611FirstNoticeAnchorMonthsBeforeExpiry', value: 6 },
  { key: 'article611EmployeeResponseWindowDays', value: 10 },
  { key: 'article611SecondNoticeDeadlineMonthsBeforeExpiry', value: 2 },
  { key: 'article612WaveAFirstNoticeWindowDays', value: 10 },
  { key: 'article612WaveAFirstNoticeAnchorMonthsBefore', value: 3 },
  { key: 'article612WaveASecondNoticeDeadlineMonthsBefore', value: 1 },
  { key: 'article612WaveBFirstNoticeWindowDays', value: 5 },
  { key: 'article612WaveBFirstNoticeAnchorMonthsBefore', value: 1 },
  { key: 'article612WaveBSecondNoticeDeadlineDaysBefore', value: 10 },
];

export const LEAVE_POLICY_EFFECTIVE_FROM = new Date('2026-01-01');

// annualLeaveAccrualBasis는 문자열 값이라 위 숫자 배열과 타입이 달라
// 별도로 둔다 — LeaveAccrualBasisResolverService가 이 키 하나만 읽는다.
export const LEAVE_ACCRUAL_BASIS_DEFAULT: { key: string; value: string } = {
  key: 'annualLeaveAccrualBasis',
  value: 'ANNIVERSARY',
};
