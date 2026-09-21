import { leaveUnitDayFraction } from './leave-unit-day-fraction';

describe('leaveUnitDayFraction', () => {
  it('FULL은 1일', () => {
    expect(leaveUnitDayFraction('FULL')).toBe(1);
  });
  it('HALF_AM/HALF_PM은 0.5일', () => {
    expect(leaveUnitDayFraction('HALF_AM')).toBe(0.5);
    expect(leaveUnitDayFraction('HALF_PM')).toBe(0.5);
  });
  it('QUARTER는 0.25일', () => {
    expect(leaveUnitDayFraction('QUARTER')).toBe(0.25);
  });
});
