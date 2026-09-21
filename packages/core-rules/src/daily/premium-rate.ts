import { PolicyConfig } from '../types/policy-config';
import { ApprovalStatus, BreakdownEntry, PayBucket } from '../types/results';
import { segmentMinutes } from '../time/segments';
import { AttributedSegment } from './night-holiday-attribution';

export interface PremiumRateInput {
  /** 휴게를 제외한 실근로 세그먼트. 시간순 정렬되어 있어야 한다. */
  segments: AttributedSegment[];
  isUnderFiveEmployees: boolean;
  /** null=신청조차 없음(미승인). 연장/휴일 버킷의 승인 축 판정에 쓰인다. */
  overtimeApproved: boolean | null;
  policy: Pick<
    PolicyConfig,
    'dailyStatutoryLimitMinutes' | 'overtimePremiumRate' | 'nightPremiumRate' | 'holidayPremiumRateWithin8h' | 'holidayPremiumRateExcess8h'
  >;
}

function approvalFor(bucket: PayBucket, overtimeApproved: boolean | null): ApprovalStatus {
  if (bucket === 'REGULAR' || bucket === 'BREAK') return 'N_A';
  return overtimeApproved === true ? 'APPROVED' : 'UNAPPROVED';
}

/**
 * 세그먼트별 [연장]×[야간]×[휴일] 3축을 지급배율로 합성한다.
 * 배율 = 1.0 + holidayAddon + nightAddon (+ overtimeAddon, 단 holidayAddon>0이면 0).
 * night는 언제나 독립적으로 가산된다. 휴일 8h 이내/초과는 역일(calendarDate)별로
 * 독립 누적한다(시나리오12 역일분할과 정합). 승인 여부는 이 배율에 절대
 * 영향을 주지 않는다 — approvalStatus로만 구분한다.
 */
export function computePremiumBreakdown(input: PremiumRateInput): BreakdownEntry[] {
  const { policy } = input;
  const entries: BreakdownEntry[] = [];

  let regularMinutesUsedNonHoliday = 0;
  const holidayCumulativeByDate = new Map<string, number>();

  for (const seg of input.segments) {
    const minutes = segmentMinutes(seg);
    if (minutes <= 0) continue;

    if (seg.isHoliday) {
      const usedSoFar = holidayCumulativeByDate.get(seg.calendarDate) ?? 0;
      const remainingWithin8h = Math.max(0, policy.dailyStatutoryLimitMinutes - usedSoFar);
      const withinMinutes = Math.min(minutes, remainingWithin8h);
      const excessMinutes = minutes - withinMinutes;
      holidayCumulativeByDate.set(seg.calendarDate, usedSoFar + minutes);

      if (withinMinutes > 0) {
        entries.push(
          buildEntry(seg, seg.startAt, withinMinutes, 'HOLIDAY_NORMAL', input.overtimeApproved, policy, seg.isNight ? nightAddon(policy) : 0),
        );
      }
      if (excessMinutes > 0) {
        const excessStart = withinMinutes > 0 ? shiftStart(seg, withinMinutes) : seg.startAt;
        entries.push(
          buildEntry(
            seg,
            excessStart,
            excessMinutes,
            'HOLIDAY_EXCESS',
            input.overtimeApproved,
            policy,
            seg.isNight ? nightAddon(policy) : 0,
          ),
        );
      }
    } else {
      const usedSoFar = regularMinutesUsedNonHoliday;
      const remainingRegular = Math.max(0, policy.dailyStatutoryLimitMinutes - usedSoFar);
      const regularPortion = Math.min(minutes, remainingRegular);
      const overtimePortion = minutes - regularPortion;
      regularMinutesUsedNonHoliday += minutes;

      if (regularPortion > 0) {
        entries.push(buildEntry(seg, seg.startAt, regularPortion, 'REGULAR', input.overtimeApproved, policy, seg.isNight ? nightAddon(policy) : 0));
      }
      if (overtimePortion > 0) {
        const overtimeStart = regularPortion > 0 ? shiftStart(seg, regularPortion) : seg.startAt;
        entries.push(
          buildEntry(
            seg,
            overtimeStart,
            overtimePortion,
            'OVERTIME',
            input.overtimeApproved,
            policy,
            (seg.isNight ? nightAddon(policy) : 0) + policy.overtimePremiumRate,
          ),
        );
      }
    }
  }

  if (input.isUnderFiveEmployees) {
    // 시나리오23: 연장/야간/휴일 "가산"만 미적용 — payBucket/approvalStatus(=시간 분류)는
    // 그대로 유지한다. 산안법 야간건강진단 대상자 판정 등은 사업장 규모와 무관하게
    // 실제 야간근로 사실을 필요로 하므로, 분류 자체를 지우면 안 된다.
    return entries.map((e) => ({ ...e, rateMultiplier: 1.0 }));
  }

  return entries;
}

function nightAddon(policy: Pick<PolicyConfig, 'nightPremiumRate'>): number {
  return policy.nightPremiumRate;
}

function shiftStart(seg: AttributedSegment, offsetMinutes: number): string {
  return new Date(Date.parse(seg.startAt) + offsetMinutes * 60000).toISOString();
}

/**
 * extraAddon은 호출부에서 이미 "야간(있다면) + 연장(OVERTIME 버킷인 경우)"을
 * 합쳐서 넘긴다. 여기서는 휴일 가산만 버킷으로부터 결정해 더한다 — 이렇게
 * 분리해야 "holidayAddon>0이면 overtimeAddon 별도 가산 없음"(시나리오15) 규칙을
 * extraAddon 조립 시점(호출부)에서 자연스럽게 강제할 수 있다: 휴일 버킷에는애초에
 * overtimePremiumRate를 더하지 않고 넘기기 때문이다.
 */
function buildEntry(
  seg: AttributedSegment,
  startAt: string,
  minutes: number,
  bucket: Exclude<PayBucket, 'BREAK'>,
  overtimeApproved: boolean | null,
  policy: Pick<PolicyConfig, 'holidayPremiumRateWithin8h' | 'holidayPremiumRateExcess8h'>,
  extraAddon: number,
): BreakdownEntry {
  const endAt = new Date(Date.parse(startAt) + minutes * 60000).toISOString();
  const holidayAddon =
    bucket === 'HOLIDAY_NORMAL'
      ? policy.holidayPremiumRateWithin8h
      : bucket === 'HOLIDAY_EXCESS'
        ? policy.holidayPremiumRateExcess8h
        : 0;

  return {
    startAt,
    endAt,
    minutes,
    flags: { overtime: bucket === 'OVERTIME', night: seg.isNight },
    payBucket: bucket,
    approvalStatus: approvalFor(bucket, overtimeApproved),
    rateMultiplier: 1.0 + holidayAddon + extraAddon,
    note: describeEntry(bucket, seg.isNight, seg.isHoliday),
  };
}

// BREAK 버킷은 daily-attendance.ts가 직접 만들고(휴게는 premium-rate의 관심사가
// 아니다), buildEntry는 애초에 그 외 4종만 받는다 — 여기 switch에 BREAK 케이스를
// 넣지 않는 것 자체가 그 사실을 타입으로 강제한다.
function describeEntry(bucket: Exclude<PayBucket, 'BREAK'>, isNight: boolean, isHoliday: boolean): string {
  const parts: string[] = [];
  switch (bucket) {
    case 'REGULAR':
      parts.push('소정근로');
      break;
    case 'OVERTIME':
      parts.push('연장근로(§56①, +50%)');
      break;
    case 'HOLIDAY_NORMAL':
      parts.push('휴일근로 8h 이내(§56②1호, +50%)');
      break;
    case 'HOLIDAY_EXCESS':
      parts.push('휴일근로 8h 초과(§56②2호, +100% — 연장가산 별도 가산 없음)');
      break;
  }
  if (isNight) parts.push('야간(§56③, +50%)');
  if (isHoliday && bucket !== 'HOLIDAY_NORMAL' && bucket !== 'HOLIDAY_EXCESS') parts.push('(휴일)');
  return parts.join(' + ');
}
