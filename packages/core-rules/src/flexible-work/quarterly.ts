import { FlexibleWorkPolicyConfig, PolicyConfig } from '../types/policy-config';
import { FlexibleWorkViolationResult, WeeklyTotal } from './biweekly';
import { assertFlexibleWorkEligible, WorkerProfile } from './eligibility-guard';

export interface FlexibleDailyTotal {
  date: string;
  totalMinutes: number;
}

export interface QuarterlyCheckInput {
  worker: WorkerProfile;
  agreementInPlace: boolean;
  weeklyTotals: WeeklyTotal[];
  dailyTotals: FlexibleDailyTotal[];
  policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes'> &
    Pick<FlexibleWorkPolicyConfig, 'extendedWeeklyCapMinutes' | 'extendedDailyCapMinutes'>;
}

/** 탄력적 3개월제(§51의2①) 상한 위반 판정만 한다: 평균 40h + 특정 주 52h + 특정일 12h. */
export function checkQuarterlyFlexibleWork(input: QuarterlyCheckInput): FlexibleWorkViolationResult {
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

  return { violated: reasons.length > 0, reasons };
}
