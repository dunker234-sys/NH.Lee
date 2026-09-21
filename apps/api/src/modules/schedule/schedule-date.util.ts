import { addDays } from '../../common/time/week.util';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** "YYYY-MM-DD" 근무일 + "HH:mm" 시각을 KST 벽시계 시각으로 해석해 그
 * 인스턴트(UTC Date)를 만든다. work-date.util.ts의 deriveWorkDate()가
 * 정확히 그 역변환이라, 여기서 만든 인스턴트에 deriveWorkDateString()을
 * 적용하면 항상 dateStr로 되돌아온다(자기일관성 — 시업일 귀속 보장의
 * 근거). */
export function kstWallTimeToInstant(dateStr: string, hhmm: string): Date {
  const utcMs = Date.parse(`${dateStr}T${hhmm}:00.000Z`);
  return new Date(utcMs - KST_OFFSET_MS);
}

/** @db.Time(0) 컬럼(1970-01-01 anchored UTC Date)에서 "HH:mm"을 뽑는다. */
export function formatTimeOfDay(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 두 "YYYY-MM-DD" 사이의 정수 일수 차이(b - a). */
export function daysBetween(a: string, b: string): number {
  const aMs = Date.parse(`${a}T00:00:00.000Z`);
  const bMs = Date.parse(`${b}T00:00:00.000Z`);
  return Math.round((bMs - aMs) / (24 * 60 * 60 * 1000));
}

/** 항상 [0, n) 범위로 떨어지는 나머지(음수 입력 대응). */
export function positiveMod(x: number, n: number): number {
  return ((x % n) + n) % n;
}

export { addDays };
