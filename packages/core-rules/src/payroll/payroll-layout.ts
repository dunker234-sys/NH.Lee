export type PayrollLayoutType = 'MONTHLY' | 'DAILY';

export type PayrollEmploymentType = 'REGULAR' | 'CONTRACT' | 'PART_TIME' | 'ULTRA_PART_TIME' | 'DAILY' | 'DISPATCHED';

/**
 * 급여 산출 레이아웃 선택 — 일용(DAILY)만 일 단위 레이아웃, 나머지는 전부 월 단위.
 * 사소한 매핑이지만 산출·내보내기 양쪽이 같은 기준을 참조하도록 이름 붙은 순수
 * 함수로 분리한다(STEP11).
 */
export function selectPayrollLayoutType(employmentType: PayrollEmploymentType): PayrollLayoutType {
  return employmentType === 'DAILY' ? 'DAILY' : 'MONTHLY';
}
