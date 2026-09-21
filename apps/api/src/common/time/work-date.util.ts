// recordedAt(timestamptz)의 Asia/Seoul(KST, UTC+9) 달력일을 도출한다.
// 정책/DB 조회가 없는 순수 계산이라 실패할 수 없다 — CLAUDE.md 절대 규칙 5:
// work_date는 별도 date 컬럼으로 저장하며 recorded_at에 대한 ::date 캐스팅을
// 쓰지 않는다(서버가 이렇게 명시적으로 산출해 저장한다).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** @db.Date 컬럼에 바로 쓸 수 있는 Date(그 KST 달력일의 자정 UTC로 표현). */
export function deriveWorkDate(recordedAt: Date): Date {
  const kst = new Date(recordedAt.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

/** "YYYY-MM-DD" 문자열 — RecalculationTriggerService 등 string 기반 API용. */
export function deriveWorkDateString(recordedAt: Date): string {
  return deriveWorkDate(recordedAt).toISOString().slice(0, 10);
}
