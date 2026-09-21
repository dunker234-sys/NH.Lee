import { DailyCalculationInput, PunchEvent } from '../types/inputs';
import { PolicyConfig } from '../types/policy-config';
import { BreakdownEntry, DailyAttendanceResult, ReviewFlag } from '../types/results';
import { MissingClockInError } from '../types/errors';
import { diffMinutes, isAfterOrEqual } from '../time/minutes';
import { MinuteSegment, subtractSegments } from '../time/segments';
import { resolveBreak } from '../break/break-resolution';
import { computeEarlyLeaveMinutes, computeLatenessMinutes } from '../leave/absence';
import { attributeNightAndHoliday, AttributedSegment } from './night-holiday-attribution';
import { computePremiumBreakdown } from './premium-rate';

function dedupePunches(punches: PunchEvent[]): PunchEvent[] {
  const seen = new Set<string>();
  const result: PunchEvent[] = [];
  for (const p of punches) {
    const key = `${p.type}|${p.recordedAt}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
}

function computeScheduledMinutes(input: DailyCalculationInput): number {
  if (!input.scheduledStartAt || !input.scheduledEndAt) return 0;
  const span = diffMinutes(input.scheduledStartAt, input.scheduledEndAt);
  const breakTotal = input.scheduledBreakSegments.reduce(
    (sum, seg) => sum + diffMinutes(seg.startAt, seg.endAt),
    0,
  );
  return Math.max(0, span - breakTotal);
}

function absenceResult(input: DailyCalculationInput): DailyAttendanceResult {
  return {
    status: 'CALCULATED',
    workDate: input.workDate,
    scheduledWorkMinutes: computeScheduledMinutes(input),
    actualWorkMinutes: 0,
    approvedOvertimeMinutes: 0,
    unapprovedOvertimeMinutes: 0,
    scheduledExcessMinutes: 0,
    nightWorkMinutes: 0,
    holidayWorkMinutesNormal: 0,
    holidayWorkMinutesExcess: 0,
    breakMinutes: 0,
    latenessMinutes: 0,
    earlyLeaveMinutes: 0,
    isAbsence: true,
    paidLeaveMinutes: input.paidLeaveMinutes,
    reviewFlags: [],
    warnings: [],
    breakdown: [],
  };
}

function sumMinutes(entries: BreakdownEntry[]): number {
  return entries.reduce((sum, e) => sum + e.minutes, 0);
}

/**
 * 근로시간은 지휘·감독 아래 실제 제공된 시간 기준(§50③)이다. 승인 여부는
 * 성립 요건이 아니라 사후 검증 절차이며, workNotProvidedJudgment.judged===true인
 * 경우에만 실제 계산에서 제외된다 — 그 외에는 어떤 설정 조합에서도 실제
 * 타각이 있는 시간을 0으로 만들지 않는다(CLAUDE.md 절대 규칙 2).
 */
export function calculateDailyAttendance(
  input: DailyCalculationInput,
  policy: PolicyConfig,
): DailyAttendanceResult {
  const punches = dedupePunches(input.punches);

  if (punches.length === 0) {
    return absenceResult(input);
  }

  const inPunch = punches.find((p) => p.type === 'IN');
  if (!inPunch) {
    throw new MissingClockInError();
  }

  const outPunch = [...punches].reverse().find((p) => p.type === 'OUT' && isAfterOrEqual(p.recordedAt, inPunch.recordedAt));
  if (!outPunch) {
    return {
      status: 'PENDING',
      reason: 'CLOCK_OUT_MISSING',
      workDate: input.workDate,
      partial: {
        scheduledWorkMinutes: computeScheduledMinutes(input),
        lastPunchAt: punches[punches.length - 1]?.recordedAt ?? null,
      },
    };
  }

  const stay: MinuteSegment = { startAt: inPunch.recordedAt, endAt: outPunch.recordedAt };

  const breakResult = resolveBreak({
    stayStartAt: stay.startAt,
    stayEndAt: stay.endAt,
    punches,
    scheduledBreakSegments: input.scheduledBreakSegments,
    breakNotGrantedReported: input.breakNotGrantedReported,
    policy,
  });

  const workSegments = subtractSegments(stay, breakResult.breakSegments);
  const attributedSegments: AttributedSegment[] = workSegments.flatMap((seg) =>
    attributeNightAndHoliday(seg, input.holidayStatusByCalendarDate, policy),
  );

  const workBreakdown = computePremiumBreakdown({
    segments: attributedSegments,
    isUnderFiveEmployees: input.isUnderFiveEmployees,
    overtimeApproved: input.overtimeApproved,
    policy,
  });

  const breakEntries: BreakdownEntry[] = breakResult.breakSegments.map((seg) => ({
    startAt: seg.startAt,
    endAt: seg.endAt,
    minutes: diffMinutes(seg.startAt, seg.endAt),
    flags: { overtime: false, night: false },
    payBucket: 'BREAK',
    approvalStatus: 'N_A',
    rateMultiplier: 0,
    note: '휴게(무급, 근로시간에서 제외)',
  }));

  let breakdown = [...workBreakdown, ...breakEntries].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );

  // 시나리오5: 관리자가 "근로 미제공"으로 명시 판정한 경우에만 제외한다.
  // 미승인 연장(OVERTIME 버킷, UNAPPROVED) 전체가 판정 대상이다 — 이 분기가
  // unapprovedOvertimeMinutes를 0으로 만드는 유일한 코드 경로다.
  if (input.workNotProvidedJudgment?.judged === true) {
    breakdown = breakdown.map((e) =>
      e.payBucket === 'OVERTIME' && e.approvalStatus === 'UNAPPROVED'
        ? { ...e, minutes: 0, note: `${e.note} — 근로 미제공으로 판정되어 제외됨(사유: ${input.workNotProvidedJudgment?.reason ?? '미기재'})` }
        : e,
    );
  }

  const nonBreak = breakdown.filter((e) => e.payBucket !== 'BREAK');
  const overtimeEntries = nonBreak.filter((e) => e.payBucket === 'OVERTIME');
  const regularMinutes = sumMinutes(nonBreak.filter((e) => e.payBucket === 'REGULAR'));

  const approvedOvertimeMinutes = sumMinutes(overtimeEntries.filter((e) => e.approvalStatus === 'APPROVED'));
  const unapprovedOvertimeMinutes = sumMinutes(overtimeEntries.filter((e) => e.approvalStatus === 'UNAPPROVED'));
  const holidayWorkMinutesNormal = sumMinutes(nonBreak.filter((e) => e.payBucket === 'HOLIDAY_NORMAL'));
  const holidayWorkMinutesExcess = sumMinutes(nonBreak.filter((e) => e.payBucket === 'HOLIDAY_EXCESS'));
  const nightWorkMinutes = sumMinutes(nonBreak.filter((e) => e.flags.night));
  const actualWorkMinutes = sumMinutes(nonBreak);

  const scheduledExcessMinutes =
    input.contractedDailyWorkMinutes != null ? Math.max(0, regularMinutes - input.contractedDailyWorkMinutes) : 0;

  const latenessMinutes = computeLatenessMinutes(input.scheduledStartAt, stay.startAt);
  const earlyLeaveMinutes = computeEarlyLeaveMinutes(input.scheduledEndAt, stay.endAt);

  const reviewFlags: ReviewFlag[] = [...breakResult.reviewFlags];
  if (unapprovedOvertimeMinutes > 0) reviewFlags.push('UNAPPROVED_ACTUAL');

  return {
    status: 'CALCULATED',
    workDate: input.workDate,
    scheduledWorkMinutes: computeScheduledMinutes(input),
    actualWorkMinutes,
    approvedOvertimeMinutes,
    unapprovedOvertimeMinutes,
    scheduledExcessMinutes,
    nightWorkMinutes,
    holidayWorkMinutesNormal,
    holidayWorkMinutesExcess,
    breakMinutes: breakResult.breakMinutes,
    latenessMinutes,
    earlyLeaveMinutes,
    isAbsence: false,
    paidLeaveMinutes: input.paidLeaveMinutes,
    reviewFlags: [...new Set(reviewFlags)],
    warnings: breakResult.warnings,
    breakdown,
  };
}
