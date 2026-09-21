function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * 단순 `Date#setUTCMonth`로 개월수를 빼면 "존재하지 않는 날짜"가 조용히
 * 다음 달로 밀린다(예: 2027-01-31에서 2개월을 빼면 "11월 31일"이 없어
 * 12월 1일로 밀린다 — §61 기한 계산에서 이 오차는 촉진 절차 자체를
 * 무효로 만들 수 있어 반드시 말일로 클램핑한다: 2026-11-30).
 */
export function subtractMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  let targetMonthIndex = month - months;
  let targetYear = year;
  while (targetMonthIndex < 0) {
    targetMonthIndex += 12;
    targetYear -= 1;
  }

  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonthIndex));
  return new Date(Date.UTC(targetYear, targetMonthIndex, clampedDay)).toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
