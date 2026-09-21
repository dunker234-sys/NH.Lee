import { FlexibleWorkAgreementMissingError, FlexibleWorkNotEligibleError } from '../types/errors';
import { assertFlexibleWorkEligible } from './eligibility-guard';

describe('assertFlexibleWorkEligible', () => {
  it('시나리오32: 18세 미만 근로자 → 오류', () => {
    expect(() => assertFlexibleWorkEligible({ isMinor: true, isPregnant: false }, true)).toThrow(
      FlexibleWorkNotEligibleError,
    );
  });

  it('시나리오32: 임신 중 근로자 → 오류', () => {
    expect(() => assertFlexibleWorkEligible({ isMinor: false, isPregnant: true }, true)).toThrow(
      FlexibleWorkNotEligibleError,
    );
  });

  it('시나리오40: labor_agreement/work_rule 근거 없음 → 오류(설정만으로 활성화 불가)', () => {
    expect(() => assertFlexibleWorkEligible({ isMinor: false, isPregnant: false }, false)).toThrow(
      FlexibleWorkAgreementMissingError,
    );
  });

  it('둘 다 문제없으면 통과한다', () => {
    expect(() => assertFlexibleWorkEligible({ isMinor: false, isPregnant: false }, true)).not.toThrow();
  });
});
