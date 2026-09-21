export interface FiscalVsAnniversaryReconciliationInput {
  fiscalYearBasisGrantedDaysCumulative: number;
  anniversaryBasisGrantedDaysCumulative: number;
}

export interface FiscalVsAnniversaryReconciliationResult {
  shortfallDays: number;
  requiresAdditionalGrant: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 회계연도 기준으로 연차를 운영해온 근로자가 퇴직할 때, 입사일 기준으로
 * 계산했다면 받았을 누적 발생일수와 비교한다(요구사항서4.3 §1 "퇴직
 * 시점 입사일 기준 정산 비교"). 회계연도 기준이 근로자에게 불리하게
 * 적었던 만큼(근로자 유리 원칙)만 추가 부여 대상이다 — 반대(회계연도
 * 기준이 더 많음)는 이미 지급된 것을 회수하지 않는다.
 */
export function reconcileFiscalYearVsAnniversaryOnResignation(
  input: FiscalVsAnniversaryReconciliationInput,
): FiscalVsAnniversaryReconciliationResult {
  const shortfallDays = Math.max(
    0,
    round2(input.anniversaryBasisGrantedDaysCumulative - input.fiscalYearBasisGrantedDaysCumulative),
  );
  return { shortfallDays, requiresAdditionalGrant: shortfallDays > 0 };
}
