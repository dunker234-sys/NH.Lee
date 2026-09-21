import { PolicyConfig } from '../types/policy-config';
import { determineAnnualLeaveApplicability } from './annual-leave-applicability';

const policy: Pick<PolicyConfig, 'annualLeaveMinContinuousMonths'> = { annualLeaveMinContinuousMonths: 12 };

describe('determineAnnualLeaveApplicability — 시나리오24 (계속 1년 5인 이상, 시행령§7의2③)', () => {
  it('사유 발생일 전 1년 내내 5인 이상이면 적용된다', () => {
    const applicable = determineAnnualLeaveApplicability(
      '2026-08-24',
      [{ startDate: '2020-01-01', endDate: null, isUnderFive: false }],
      policy,
    );
    expect(applicable).toBe(true);
  });

  it('1년 중 일부라도 5인 미만 구간이 겹치면 미적용된다', () => {
    const applicable = determineAnnualLeaveApplicability(
      '2026-08-24',
      [
        { startDate: '2020-01-01', endDate: '2026-03-01', isUnderFive: false },
        { startDate: '2026-03-01', endDate: '2026-05-01', isUnderFive: true }, // 1년 창(2025-08-24~) 안에 겹침
        { startDate: '2026-05-01', endDate: null, isUnderFive: false },
      ],
      policy,
    );
    expect(applicable).toBe(false);
  });

  it('현재까지 계속되는(endDate=null) 5인 미만 구간이 1년 창과 겹치면 미적용된다', () => {
    const applicable = determineAnnualLeaveApplicability(
      '2026-08-24',
      [{ startDate: '2026-01-01', endDate: null, isUnderFive: true }],
      policy,
    );
    expect(applicable).toBe(false);
  });

  it('5인 미만 구간이 1년 창보다 훨씬 이전(2년 전)이면 지금은 적용된다', () => {
    const applicable = determineAnnualLeaveApplicability(
      '2026-08-24',
      [
        { startDate: '2020-01-01', endDate: '2024-06-01', isUnderFive: true },
        { startDate: '2024-06-01', endDate: null, isUnderFive: false },
      ],
      policy,
    );
    expect(applicable).toBe(true);
  });
});
