import { addMinutes, isBefore } from '../time/minutes';
import { MinuteSegment, segmentMinutes, splitAtBoundaries } from '../time/segments';
import { kstCalendarDate, kstMidnightIso, kstMinuteOfDay } from '../time/work-date';

/**
 * 산업안전보건법 제130조·시행규칙 별표22 제4호 전용 정책값. ①의 00:00~05:00과
 * ②의 22:00~06:00은 근기법 야간(§56③, policy_config의 nightStartMinuteOfDay/
 * nightEndMinuteOfDay)과 판정 목적이 다르므로, 값이 우연히 같더라도(②) 이
 * 모듈은 자기 자신의 정책키로 별도 주입받는다(CLAUDE.md 용어집 "야간작업
 * 특수건강진단" 비고 — 절대 규칙4에 따라 하드코딩하지 않는다).
 */
export interface NightWorkHealthCheckupPolicy {
  /** 480(8h) — ①의 최소 연속 작업시간(분) */
  criterion1MinConsecutiveMinutes: number;
  /** 4 — ① 월평균 최소 횟수. monthsInWindow와 곱해 총 필요 횟수를 만든다(부동소수점 비교 회피). */
  criterion1MonthlyAvgThreshold: number;
  /** 3600(60h를 분으로) — ② 월평균 최소 시간(분). 마찬가지로 monthsInWindow와 곱해 총 필요 분을 만든다. */
  criterion2MonthlyAvgMinutesThreshold: number;
  /** 6 — 판정 대상 개월 수(시행규칙 별표22 제4호) */
  monthsInWindow: number;
  /** 0(00:00) — ① 판정 대상 시간대 시작(분) */
  criterion1BandStartMinuteOfDay: number;
  /** 300(05:00) — ① 판정 대상 시간대 종료(분) */
  criterion1BandEndMinuteOfDay: number;
  /** 1320(22:00) — ② 판정 대상 시간대 시작(분) */
  criterion2BandStartMinuteOfDay: number;
  /** 360(06:00) — ② 판정 대상 시간대 종료(분) */
  criterion2BandEndMinuteOfDay: number;
}

export interface NightWorkSession extends MinuteSegment {}

export interface NightWorkHealthCheckupInput {
  /** 판정 대상 6개월 창 안의 실제 연속 작업 세션들. 휴게로 끊긴 경우 호출자가
   * 이미 별도 세션으로 분리해 전달한다 — 이 함수는 세션 사이 간격을 다시
   * 이어붙이지 않는다("연속되는 8시간"의 판정 단위는 호출자 책임). */
  sessions: NightWorkSession[];
  policy: NightWorkHealthCheckupPolicy;
}

export interface NightWorkHealthCheckupResult {
  criterion1Count: number;
  /** criterion1MonthlyAvgThreshold * monthsInWindow — 감사용 산출 근거. */
  criterion1RequiredCount: number;
  criterion1Met: boolean;
  criterion2TotalMinutes: number;
  /** criterion2MonthlyAvgMinutesThreshold * monthsInWindow — 감사용 산출 근거. */
  criterion2RequiredMinutes: number;
  criterion2Met: boolean;
  /** ① 또는 ② 어느 한쪽만 충족해도 대상이다(별표22 제4호는 "또는"). */
  eligible: boolean;
}

function nextCalendarDate(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 세션을 KST 역일 경계에서 쪼갠 뒤, 각 조각이 걸리는 그 날의 밴드 구간과
 * 겹치는 분을 합산한다. bandStart > bandEnd면 자정을 걸치는 밴드(예:
 * 22:00~06:00)로 취급한다 — daily/night-holiday-attribution.ts의 야간 판정과
 * 같은 방식이지만, 이 모듈은 임의의 밴드(00:00~05:00 등)에 대해 일반화한다.
 */
export function sumOverlapMinutesWithDailyBand(
  session: MinuteSegment,
  bandStartMinuteOfDay: number,
  bandEndMinuteOfDay: number,
): number {
  const dateBoundaries: string[] = [];
  let cursor = kstCalendarDate(session.startAt);
  while (isBefore(kstMidnightIso(cursor), session.endAt)) {
    dateBoundaries.push(kstMidnightIso(cursor));
    cursor = nextCalendarDate(cursor);
  }

  const dateSegments = splitAtBoundaries(session, dateBoundaries);
  let total = 0;
  for (const seg of dateSegments) {
    const calendarDate = kstCalendarDate(seg.startAt);
    const midnight = kstMidnightIso(calendarDate);
    const bandEndIso = addMinutes(midnight, bandEndMinuteOfDay);
    const bandStartIso = addMinutes(midnight, bandStartMinuteOfDay);

    const pieces = splitAtBoundaries(seg, [bandEndIso, bandStartIso]);
    for (const piece of pieces) {
      const minuteOfDay = kstMinuteOfDay(piece.startAt);
      const inBand =
        bandStartMinuteOfDay > bandEndMinuteOfDay
          ? minuteOfDay < bandEndMinuteOfDay || minuteOfDay >= bandStartMinuteOfDay
          : minuteOfDay >= bandStartMinuteOfDay && minuteOfDay < bandEndMinuteOfDay;
      if (inBand) total += segmentMinutes(piece);
    }
  }
  return total;
}

/**
 * 야간작업 특수건강진단 대상자 판정(산안법 §130, 시행규칙 별표22 제4호).
 * ① "6개월간 00:00~05:00을 포함하는 연속 8h 작업이 월평균 4회 이상" 또는
 * ② "6개월간 22:00~06:00 작업이 월평균 60h 이상" — 어느 한쪽만 충족해도
 * 대상이다. 부동소수점 나눗셈 비교를 피하기 위해 "횟수/분 >= 월평균×개월수"가
 * 아니라 "횟수/분 >= 임계값×개월수"의 정수 곱셈 비교로 판정한다(CLAUDE.md
 * 절대 규칙6).
 */
export function determineNightWorkHealthCheckupEligibility(
  input: NightWorkHealthCheckupInput,
): NightWorkHealthCheckupResult {
  const { sessions, policy } = input;

  const criterion1Count = sessions.filter(
    (s) =>
      segmentMinutes(s) >= policy.criterion1MinConsecutiveMinutes &&
      sumOverlapMinutesWithDailyBand(s, policy.criterion1BandStartMinuteOfDay, policy.criterion1BandEndMinuteOfDay) > 0,
  ).length;

  const criterion2TotalMinutes = sessions.reduce(
    (sum, s) => sum + sumOverlapMinutesWithDailyBand(s, policy.criterion2BandStartMinuteOfDay, policy.criterion2BandEndMinuteOfDay),
    0,
  );

  const criterion1RequiredCount = policy.criterion1MonthlyAvgThreshold * policy.monthsInWindow;
  const criterion2RequiredMinutes = policy.criterion2MonthlyAvgMinutesThreshold * policy.monthsInWindow;

  const criterion1Met = criterion1Count >= criterion1RequiredCount;
  const criterion2Met = criterion2TotalMinutes >= criterion2RequiredMinutes;

  return {
    criterion1Count,
    criterion1RequiredCount,
    criterion1Met,
    criterion2TotalMinutes,
    criterion2RequiredMinutes,
    criterion2Met,
    eligible: criterion1Met || criterion2Met,
  };
}
