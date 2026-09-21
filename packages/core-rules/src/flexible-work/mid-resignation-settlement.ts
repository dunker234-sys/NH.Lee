import { PolicyConfig } from '../types/policy-config';
import { WeeklyTotal } from './biweekly';

export interface MidResignationSettlementInput {
  /** 근로한 실제 기간의 주별 총 근로시간(분) */
  weeklyTotals: WeeklyTotal[];
  policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes'>;
}

export interface MidResignationSettlementResult {
  weeklyExcess: { weekStartDate: string; excessMinutes: number }[];
  /** 안분(비례배분) 없이 전부 가산 정산 대상(§51의3) */
  totalExcessMinutes: number;
}

/**
 * 탄력적 근로시간제 중도 퇴사자 정산(§51의3). 근로한 기간을 평균해
 * 1주 40시간 초과분 전부에 가산임금을 정산한다 — 탄력제 정산기간 전체
 * 평균으로 안분하지 않는다(시나리오31).
 */
export function calculateMidResignationSettlement(
  input: MidResignationSettlementInput,
): MidResignationSettlementResult {
  const weeklyExcess = input.weeklyTotals.map((w) => ({
    weekStartDate: w.weekStartDate,
    excessMinutes: Math.max(0, w.totalMinutes - input.policy.weeklyStatutoryLimitMinutes),
  }));
  const totalExcessMinutes = weeklyExcess.reduce((sum, w) => sum + w.excessMinutes, 0);

  return { weeklyExcess, totalExcessMinutes };
}
