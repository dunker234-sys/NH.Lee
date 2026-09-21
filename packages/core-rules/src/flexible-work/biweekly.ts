import { FlexibleWorkPolicyConfig, PolicyConfig } from '../types/policy-config';
import { assertFlexibleWorkEligible, WorkerProfile } from './eligibility-guard';

export interface WeeklyTotal {
  weekStartDate: string;
  totalMinutes: number;
}

export interface BiweeklyCheckInput {
  worker: WorkerProfile;
  agreementInPlace: boolean;
  /** 2주 전체(보통 2건) */
  weeklyTotals: WeeklyTotal[];
  policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes'> & Pick<FlexibleWorkPolicyConfig, 'biweeklyWeeklyCapMinutes'>;
}

export interface FlexibleWorkViolationResult {
  violated: boolean;
  reasons: string[];
}

/**
 * 탄력적 2주제(§51①) 상한 위반 판정만 한다(가산수당 계산은 이 STEP 범위 밖 — RULES.md 참고).
 * 평균 계산은 나눗셈 대신 "총합 vs 기준×주수" 비교로 한다(부동소수점 금지 원칙,
 * CLAUDE.md 절대 규칙 6).
 */
export function checkBiweeklyFlexibleWork(input: BiweeklyCheckInput): FlexibleWorkViolationResult {
  assertFlexibleWorkEligible(input.worker, input.agreementInPlace);

  const reasons: string[] = [];
  const totalMinutes = input.weeklyTotals.reduce((sum, w) => sum + w.totalMinutes, 0);
  if (totalMinutes > input.policy.weeklyStatutoryLimitMinutes * input.weeklyTotals.length) {
    reasons.push('평균 1주 40시간을 초과했습니다.');
  }
  for (const w of input.weeklyTotals) {
    if (w.totalMinutes > input.policy.biweeklyWeeklyCapMinutes) {
      reasons.push(`특정 주(${w.weekStartDate})가 48시간 상한을 초과했습니다.`);
    }
  }

  return { violated: reasons.length > 0, reasons };
}
