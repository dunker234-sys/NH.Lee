import { selectPayrollLayoutType, PayrollEmploymentType } from './payroll-layout';

describe('selectPayrollLayoutType — 급여 산출 레이아웃 선택', () => {
  it('DAILY(일용)만 DAILY 레이아웃이다', () => {
    expect(selectPayrollLayoutType('DAILY')).toBe('DAILY');
  });

  it.each<PayrollEmploymentType>(['REGULAR', 'CONTRACT', 'PART_TIME', 'ULTRA_PART_TIME', 'DISPATCHED'])(
    '%s는 MONTHLY 레이아웃이다',
    (employmentType) => {
      expect(selectPayrollLayoutType(employmentType)).toBe('MONTHLY');
    },
  );
});
