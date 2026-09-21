import { calculateMonthlyAccrualLeave, MonthlyAttendanceRecord } from './monthly-accrual';

const policy = { annualLeaveMonthlyAccrualMaxMonths: 11 };
const firstYearEndDate = '2026-08-31';

function months(count: number, perfectCount: number): MonthlyAttendanceRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    monthStartDate: `2025-${String((i % 12) + 1).padStart(2, '0')}-01`,
    fullyAttended: i < perfectCount,
  }));
}

describe('calculateMonthlyAccrualLeave — §60② (계속근로 1년 미만/80% 미만 출근)', () => {
  it('11개월 전부 개근하면 11일 발생한다', () => {
    const result = calculateMonthlyAccrualLeave({ months: months(11, 11) }, policy, firstYearEndDate);
    expect(result.grantedDays).toBe(11);
  });

  it('1개월 결근이 섞이면 그만큼 줄어든다(10일)', () => {
    const result = calculateMonthlyAccrualLeave({ months: months(11, 10) }, policy, firstYearEndDate);
    expect(result.grantedDays).toBe(10);
  });

  it('방어적으로 12개월치가 들어와도 상한(11일)을 넘지 않는다', () => {
    const result = calculateMonthlyAccrualLeave({ months: months(12, 12) }, policy, firstYearEndDate);
    expect(result.grantedDays).toBe(11);
  });

  it('각 1일의 소멸시한은 firstYearEndDate다(§60⑦)', () => {
    const result = calculateMonthlyAccrualLeave({ months: months(3, 3) }, policy, firstYearEndDate);
    expect(result.perMonthGrants).toHaveLength(3);
    expect(result.perMonthGrants.every((g) => g.granted && g.expiryDate === firstYearEndDate)).toBe(true);
  });

  it('개근하지 못한 달은 granted:false로 기록된다', () => {
    const result = calculateMonthlyAccrualLeave({ months: months(2, 1) }, policy, firstYearEndDate);
    expect(result.perMonthGrants[0].granted).toBe(true);
    expect(result.perMonthGrants[1].granted).toBe(false);
  });
});
