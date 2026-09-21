import { AnnualLeavePolicyConfig } from '../../types/policy-config';

export interface MonthlyAttendanceRecord {
  /** 입사일 기준 그 서비스월의 시작일(YYYY-MM-DD) */
  monthStartDate: string;
  /** 그 달 개근 여부 — 호출자가 이미 §60⑥ 출근간주 기간을 개근으로 처리해 넘긴다. */
  fullyAttended: boolean;
}

export interface MonthlyAccrualPerMonthGrant {
  monthStartDate: string;
  granted: boolean;
  expiryDate: string;
}

export interface MonthlyAccrualResult {
  grantedDays: number;
  perMonthGrants: MonthlyAccrualPerMonthGrant[];
}

/**
 * §60② — 계속근로 1년 미만이거나 80% 미만 출근인 경우, 1개월 개근당 1일.
 * 대법 2021다227100(정확히 1년짜리 기간제)에서 이 함수만 발동하고
 * calculateFullYearAnnualLeaveGrant는 호출되지 않으므로, 최대치가 구조적으로
 * policy.annualLeaveMonthlyAccrualMaxMonths(11)로 제한된다 — 15일이 섞여
 * 들어올 코드 경로 자체가 없다.
 */
export function calculateMonthlyAccrualLeave(
  input: { months: MonthlyAttendanceRecord[] },
  policy: Pick<AnnualLeavePolicyConfig, 'annualLeaveMonthlyAccrualMaxMonths'>,
  firstYearEndDate: string,
): MonthlyAccrualResult {
  const perMonthGrants: MonthlyAccrualPerMonthGrant[] = input.months.map((m) => ({
    monthStartDate: m.monthStartDate,
    granted: m.fullyAttended,
    expiryDate: firstYearEndDate,
  }));

  const fullyAttendedCount = perMonthGrants.filter((g) => g.granted).length;
  const grantedDays = Math.min(fullyAttendedCount, policy.annualLeaveMonthlyAccrualMaxMonths);

  return { grantedDays, perMonthGrants };
}
