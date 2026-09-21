import { LeaveUnit } from './leave-application';

/** LeaveBalance.usedDays/deductedDays 차감 단위 환산 — leave-application.ts의
 * 분(minute) 환산(fractionMinutes)과 같은 값을 "일" 단위로 표현한다. */
export function leaveUnitDayFraction(unit: LeaveUnit): number {
  switch (unit) {
    case 'FULL':
      return 1;
    case 'HALF_AM':
    case 'HALF_PM':
      return 0.5;
    case 'QUARTER':
      return 0.25;
  }
}
