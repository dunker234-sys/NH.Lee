import { FlexibleWorkPolicyConfig, PolicyConfig } from '../types/policy-config';
import { diffMinutes } from '../time/minutes';
import { FlexibleWorkViolationResult, WeeklyTotal } from './biweekly';
import { FlexibleDailyTotal } from './quarterly';
import { assertFlexibleWorkEligible, WorkerProfile } from './eligibility-guard';
import { checkConsecutiveRestBetweenShifts } from '../schedule/consecutive-rest';

export interface SemiannualCheckInput {
  worker: WorkerProfile;
  agreementInPlace: boolean;
  weeklyTotals: WeeklyTotal[];
  dailyTotals: FlexibleDailyTotal[];
  /** 근무일 사이 실제 확보된 휴식 간격들(분) — §51의2② */
  restGapsMinutes: number[];
  /** 스케줄이 실제로 통보(확정 고지)된 시각 */
  noticeGivenAt: string;
  /** 그 스케줄이 적용되기 시작하는 시각 */
  arrangementStartAt: string;
  policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes'> &
    Pick<FlexibleWorkPolicyConfig, 'extendedWeeklyCapMinutes' | 'extendedDailyCapMinutes' | 'continuousRestMinutes' | 'semiannualNoticeDaysBefore'>;
}

/**
 * 탄력적 6개월제(§51의2). 3개월제 상한(평균 40h, 특정주 52h, 특정일 12h)에
 * 더해 연속 11시간 휴식과 2주 전 통보 기한을 추가로 검증한다.
 */
export function checkSemiannualFlexibleWork(input: SemiannualCheckInput): FlexibleWorkViolationResult {
  assertFlexibleWorkEligible(input.worker, input.agreementInPlace);

  const reasons: string[] = [];
  const totalMinutes = input.weeklyTotals.reduce((sum, w) => sum + w.totalMinutes, 0);
  if (totalMinutes > input.policy.weeklyStatutoryLimitMinutes * input.weeklyTotals.length) {
    reasons.push('평균 1주 40시간을 초과했습니다.');
  }
  for (const w of input.weeklyTotals) {
    if (w.totalMinutes > input.policy.extendedWeeklyCapMinutes) {
      reasons.push(`특정 주(${w.weekStartDate})가 52시간 상한을 초과했습니다.`);
    }
  }
  for (const d of input.dailyTotals) {
    if (d.totalMinutes > input.policy.extendedDailyCapMinutes) {
      reasons.push(`특정일(${d.date})이 12시간 상한을 초과했습니다.`);
    }
  }

  const restCheck = checkConsecutiveRestBetweenShifts(
    input.restGapsMinutes.map((gapMinutes, i) => ({ afterWorkDate: `gap-${i}`, gapMinutes })),
    input.policy.continuousRestMinutes,
  );
  if (restCheck.violated) {
    reasons.push(`근무일 사이 연속 11시간 휴식이 확보되지 않은 구간이 ${restCheck.shortGaps.length}건 있습니다(§51의2②).`);
  }

  const noticeLeadMinutes = diffMinutes(input.noticeGivenAt, input.arrangementStartAt);
  const requiredLeadMinutes = input.policy.semiannualNoticeDaysBefore * 24 * 60;
  if (noticeLeadMinutes < requiredLeadMinutes) {
    reasons.push(`스케줄 확정 통보가 시행 ${input.policy.semiannualNoticeDaysBefore}일 전 기한을 지키지 못했습니다.`);
  }

  return { violated: reasons.length > 0, reasons };
}
