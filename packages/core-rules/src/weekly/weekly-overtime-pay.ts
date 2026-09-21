import { PolicyConfig } from '../types/policy-config';
import { DailyTotal } from './weekly-limit-violation';

export interface WeeklyOvertimePayInput {
  dailyTotals: DailyTotal[];
  policy: Pick<PolicyConfig, 'dailyStatutoryLimitMinutes' | 'weeklyStatutoryLimitMinutes'>;
}

export interface WeeklyOvertimePayResult {
  dailyOvertimeMinutes: { date: string; minutes: number }[];
  /** 일별 8h초과분을 뺀 "규정근로" 합계가 40h를 넘는 부분 — 이미 일별로 잡힌 시간과 겹치지 않는다. */
  weeklyBasisOvertimeMinutes: number;
  totalOvertimeForPremiumMinutes: number;
}

/**
 * 가산수당 산정(§56①). checkWeeklyLimitViolation(한도위반, 형사처벌 기준)과는
 * 완전히 다른 산식이며 별도 함수다. 일 8h초과분과 "그 나머지 규정근로 합계의
 * 40h초과분"을 각각 계산해 더한다 — 같은 시간을 두 기준으로 이중 계산하지
 * 않기 위해서다.
 *
 * ★ 적용 범위: 이 함수는 고정 8h/40h 기준이다. 그 주에 활성 탄력적/선택적
 * 근로시간제가 있는 직원에게는 쓰지 않는다 — flexible-work/의 해당 모듈이
 * 자기 상한 기준으로 별도 처리한다.
 */
export function calculateWeeklyOvertimePay(input: WeeklyOvertimePayInput): WeeklyOvertimePayResult {
  const { policy } = input;

  const dailyOvertimeMinutes = input.dailyTotals.map((d) => ({
    date: d.date,
    minutes: Math.max(0, d.totalWorkMinutes - policy.dailyStatutoryLimitMinutes),
  }));

  const dailyRegularSum = input.dailyTotals.reduce((sum, d, i) => sum + (d.totalWorkMinutes - dailyOvertimeMinutes[i].minutes), 0);
  const weeklyBasisOvertimeMinutes = Math.max(0, dailyRegularSum - policy.weeklyStatutoryLimitMinutes);

  const totalOvertimeForPremiumMinutes =
    dailyOvertimeMinutes.reduce((sum, d) => sum + d.minutes, 0) + weeklyBasisOvertimeMinutes;

  return { dailyOvertimeMinutes, weeklyBasisOvertimeMinutes, totalOvertimeForPremiumMinutes };
}
