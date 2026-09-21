/**
 * work_date는 이미 순수 달력일(YYYY-MM-DD) 문자열이라 KST 환산이 필요 없다 —
 * 이 파일은 그 문자열에 대한 달력 산술만 한다.
 */

/** 월요일 시작 ISO 주의 월요일 날짜를 반환한다. policy_config에 요일 설정 키가
 * 아직 없어 하드코딩했다(향후 설정화 후보, RULES.md/ROADMAP 갭 참고). */
export function mondayOfWeek(workDate: string): string {
  const d = new Date(`${workDate}T00:00:00.000Z`);
  const dayOfWeek = d.getUTCDay(); // 0=일 ... 6=토
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function yearMonthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Prisma @db.Date 컬럼에 넘길 Date 객체(자정 UTC로 그 달력일을 표현). */
export function dateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** [start, end) — end는 다음 달 1일(배타적 상한), Prisma range 쿼리에 바로 쓴다. */
export function monthRange(yearMonth: string): { start: Date; end: Date } {
  const [y, m] = yearMonth.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export function enumerateDates(fromDate: string, toDate: string): string[] {
  const result: string[] = [];
  let cur = fromDate;
  while (cur <= toDate) {
    result.push(cur);
    cur = addDays(cur, 1);
  }
  return result;
}
