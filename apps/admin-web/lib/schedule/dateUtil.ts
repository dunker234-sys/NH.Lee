export function daysInYearMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, '0')}`);
}

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function isNextDay(a: string, b: string): boolean {
  const aMs = Date.parse(`${a}T00:00:00.000Z`);
  const bMs = Date.parse(`${b}T00:00:00.000Z`);
  return bMs - aMs === 24 * 60 * 60 * 1000;
}
