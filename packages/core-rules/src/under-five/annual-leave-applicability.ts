import { PolicyConfig } from '../types/policy-config';

export interface HeadcountPeriod {
  startDate: string;
  /** null이면 현재까지 유효 */
  endDate: string | null;
  isUnderFive: boolean;
}

function subtractMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * 연차(§60①④) 적용 여부: 사유 발생일 전 1년 동안 "계속하여" 5인 이상이어야
 * 한다(시행령 §7의2③). daily-attendance의 isUnderFiveEmployees(해당 근로일
 * 시점 판정, 시나리오23)와는 다른 법적 기준이다 — 서로 대체하지 않는다.
 * 5인 미만이었던 구간이 하나라도 이 1년 창과 겹치면 미적용이다.
 */
export function determineAnnualLeaveApplicability(
  referenceDate: string,
  periods: HeadcountPeriod[],
  policy: Pick<PolicyConfig, 'annualLeaveMinContinuousMonths'>,
): boolean {
  const windowStart = subtractMonths(referenceDate, policy.annualLeaveMinContinuousMonths);

  const hasUnderFiveOverlap = periods.some(
    (p) => p.isUnderFive && overlaps(p.startDate, p.endDate ?? referenceDate, windowStart, referenceDate),
  );

  return !hasUnderFiveOverlap;
}
