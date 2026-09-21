import { HolidayStatusEntry } from '../types/inputs';
import { InvalidCalculationInputError } from '../types/errors';
import { PolicyConfig } from '../types/policy-config';
import { addMinutes, isBefore } from '../time/minutes';
import { MinuteSegment, splitAtBoundaries } from '../time/segments';
import { kstCalendarDate, kstMidnightIso, kstMinuteOfDay } from '../time/work-date';

export interface AttributedSegment extends MinuteSegment {
  isNight: boolean;
  /** 이 세그먼트가 실제로 걸리는 KST 역일 — work_date(시업일)와 다를 수 있다(역일 분할). */
  calendarDate: string;
  isHoliday: boolean;
}

function nextCalendarDate(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function lookupHoliday(calendarDate: string, entries: HolidayStatusEntry[]): boolean {
  const found = entries.find((e) => e.calendarDate === calendarDate);
  if (!found) {
    throw new InvalidCalculationInputError(
      `holidayStatusByCalendarDate에 ${calendarDate}(세그먼트가 실제로 걸리는 역일) 항목이 없습니다.`,
    );
  }
  return found.isHoliday;
}

/**
 * 근무 세그먼트를 (1) 실제로 걸리는 KST 역일 경계, (2) 그 역일 안의 야간(22:00~06:00)
 * 경계에서 쪼갠 뒤, 각 조각에 isNight/calendarDate/isHoliday를 붙인다.
 * work_date(시업일 귀속)는 이 함수의 관심사가 아니다 — 호출자가 별도로 들고 있는다
 * (시나리오11). 휴일 판정과 8h 누적 카운터는 여기서 나온 calendarDate 기준으로
 * 역일별 독립 집계된다(시나리오12).
 */
export function attributeNightAndHoliday(
  segment: MinuteSegment,
  holidayStatusByCalendarDate: HolidayStatusEntry[],
  policy: Pick<PolicyConfig, 'nightStartMinuteOfDay' | 'nightEndMinuteOfDay'>,
): AttributedSegment[] {
  const startDate = kstCalendarDate(segment.startAt);
  const possibleNextMidnight = kstMidnightIso(nextCalendarDate(startDate));
  const dateBoundaries =
    isBefore(segment.startAt, possibleNextMidnight) && isBefore(possibleNextMidnight, segment.endAt)
      ? [possibleNextMidnight]
      : [];
  const dateSegments = splitAtBoundaries(segment, dateBoundaries);

  const result: AttributedSegment[] = [];
  for (const dateSeg of dateSegments) {
    const calendarDate = kstCalendarDate(dateSeg.startAt);
    const isHoliday = lookupHoliday(calendarDate, holidayStatusByCalendarDate);
    const midnight = kstMidnightIso(calendarDate);
    const nightEndIso = addMinutes(midnight, policy.nightEndMinuteOfDay);
    const nightStartIso = addMinutes(midnight, policy.nightStartMinuteOfDay);

    const nightPieces = splitAtBoundaries(dateSeg, [nightEndIso, nightStartIso]);
    for (const piece of nightPieces) {
      const minuteOfDay = kstMinuteOfDay(piece.startAt);
      const isNight = minuteOfDay < policy.nightEndMinuteOfDay || minuteOfDay >= policy.nightStartMinuteOfDay;
      result.push({ ...piece, isNight, calendarDate, isHoliday });
    }
  }
  return result;
}
