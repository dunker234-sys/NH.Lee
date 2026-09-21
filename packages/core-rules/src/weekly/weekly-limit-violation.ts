import { PolicyConfig } from '../types/policy-config';

export interface DailyTotal {
  date: string;
  /** 승인·미승인 전부 포함한 그날의 총 실근로(분). 휴일근로도 포함한다. */
  totalWorkMinutes: number;
}

export interface WeeklyLimitViolationInput {
  /** 휴일을 포함한 1주(7일) 전체 — §2①7호 */
  dailyTotals: DailyTotal[];
  policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes' | 'weeklyOvertimeCapMinutes'>;
}

export interface WeeklyLimitViolationResult {
  weeklyTotalMinutes: number;
  /** 40h(weeklyStatutoryLimitMinutes) 초과분 */
  excessOver40Minutes: number;
  /** excessOver40Minutes가 12h(weeklyOvertimeCapMinutes) 초과이면 위반 — 형사처벌 판단 기준 */
  violated: boolean;
}

/**
 * 한도 위반 판정(형사처벌 대상 여부). 1주 총 근로시간 중 40h 초과분이
 * 12h를 넘는지로만 판단한다(대법원 2023.12.7. 2020도15393) — 일별 8h
 * 초과분을 합산하는 방식이 아니다. 가산수당 산정(calculateWeeklyOvertimePay)과는
 * 별도 함수다 — 서로 다른 산식이며 섞어 쓰면 안 된다.
 */
export function checkWeeklyLimitViolation(input: WeeklyLimitViolationInput): WeeklyLimitViolationResult {
  const weeklyTotalMinutes = input.dailyTotals.reduce((sum, d) => sum + d.totalWorkMinutes, 0);
  const excessOver40Minutes = Math.max(0, weeklyTotalMinutes - input.policy.weeklyStatutoryLimitMinutes);
  const violated = excessOver40Minutes > input.policy.weeklyOvertimeCapMinutes;

  return { weeklyTotalMinutes, excessOver40Minutes, violated };
}
