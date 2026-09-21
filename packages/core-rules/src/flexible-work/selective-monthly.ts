import { assertFlexibleWorkEligible, WorkerProfile } from './eligibility-guard';

export interface SelectiveMonthlySettlementInput {
  worker: WorkerProfile;
  agreementInPlace: boolean;
  /** 정산기간 총 실근로(분) */
  totalWorkedMinutes: number;
  contractedDailyWorkMinutes: number;
  workdayCount: number;
}

export interface SelectiveMonthlySettlementResult {
  /** 정산기간 총 근로시간 − (소정근로시간×근무일수) 초과분 */
  settlementMinutes: number;
}

/** 선택적 근로시간제 1개월 정산(§52). 별도 상한 검증은 하지 않는다(시나리오29). */
export function calculateSelectiveMonthlySettlement(
  input: SelectiveMonthlySettlementInput,
): SelectiveMonthlySettlementResult {
  assertFlexibleWorkEligible(input.worker, input.agreementInPlace);

  const contractedTotal = input.contractedDailyWorkMinutes * input.workdayCount;
  const settlementMinutes = Math.max(0, input.totalWorkedMinutes - contractedTotal);

  return { settlementMinutes };
}
