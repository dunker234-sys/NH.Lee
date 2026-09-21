import { AnnualLeavePolicyConfig } from '../../types/policy-config';

function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 회계연도 기준 연차 운영 시, 회계연도 중도 입사자의 첫해 발생일수를
 * 근무 가능 잔여일수 비례로 산정한다(요구사항서4.3 §1 "중도 입·퇴사자
 * 비례 계산"). 일수 단위 소수 결과라 정수 분 계산이 아니므로 CLAUDE.md
 * 절대 규칙6(시간=분 정수)의 적용 대상이 아니다 — 소수 둘째 자리에서
 * 반올림한다(LeaveBalance.grantedDays가 Decimal(5,2)).
 */
export function calculateFiscalYearFirstYearProrationDays(
  input: { hireDate: string; fiscalYearStartDate: string; fiscalYearEndDate: string },
  policy: Pick<AnnualLeavePolicyConfig, 'annualLeaveBaseDays'>,
): number {
  const totalDaysInFiscalYear = daysBetweenInclusive(input.fiscalYearStartDate, input.fiscalYearEndDate);
  const daysRemaining = daysBetweenInclusive(input.hireDate, input.fiscalYearEndDate);
  return round2((policy.annualLeaveBaseDays * daysRemaining) / totalDaysInFiscalYear);
}
