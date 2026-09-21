/**
 * KST(Asia/Seoul, UTC+9) 기준 역일 유틸. work_date(시업일 귀속) 자체는 호출자가
 * 산출해 주입하지만(절대 규칙5, 이 엔진은 재계산하지 않는다), 휴일 역일분할
 * (night-holiday-attribution.ts)은 세그먼트가 실제로 걸리는 KST 달력일을
 * 알아야 하므로 여기서 계산한다.
 */
const KST_OFFSET_MINUTES = 9 * 60;

/** 주어진 인스턴트가 속한 KST 달력일("YYYY-MM-DD")을 반환한다. */
export function kstCalendarDate(iso: string): string {
  const shiftedMs = Date.parse(iso) + KST_OFFSET_MINUTES * 60000;
  return new Date(shiftedMs).toISOString().slice(0, 10);
}

/** KST 달력일의 자정(00:00 KST)에 해당하는 UTC 인스턴트를 반환한다. */
export function kstMidnightIso(calendarDate: string): string {
  return new Date(`${calendarDate}T00:00:00+09:00`).toISOString();
}

/** 인스턴트의 KST 기준 하루 중 분(0~1439)을 반환한다. */
export function kstMinuteOfDay(iso: string): number {
  const shiftedMs = Date.parse(iso) + KST_OFFSET_MINUTES * 60000;
  const d = new Date(shiftedMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
