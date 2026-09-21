import { calculateFiscalYearFirstYearProrationDays } from './fiscal-year-proration';

const policy = { annualLeaveBaseDays: 15 };

describe('calculateFiscalYearFirstYearProrationDays — 회계연도 기준 중도입사 비례', () => {
  it('회계연도 정확히 절반 시점에 입사하면 base의 절반을 반올림한다', () => {
    const days = calculateFiscalYearFirstYearProrationDays(
      { hireDate: '2026-07-02', fiscalYearStartDate: '2026-01-01', fiscalYearEndDate: '2026-12-31' },
      policy,
    );
    // 2026-07-02~2026-12-31 = 183일 / 365일 전체 * 15 ≈ 7.52 -> round2 7.52
    expect(days).toBeCloseTo(7.52, 1);
  });

  it('회계연도 첫날 입사하면 전체 base를 그대로 받는다', () => {
    const days = calculateFiscalYearFirstYearProrationDays(
      { hireDate: '2026-01-01', fiscalYearStartDate: '2026-01-01', fiscalYearEndDate: '2026-12-31' },
      policy,
    );
    expect(days).toBe(15);
  });

  it('회계연도 마지막날 입사하면 비례분이 매우 작다(0에 가깝지만 0은 아님)', () => {
    const days = calculateFiscalYearFirstYearProrationDays(
      { hireDate: '2026-12-31', fiscalYearStartDate: '2026-01-01', fiscalYearEndDate: '2026-12-31' },
      policy,
    );
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThan(1);
  });
});
