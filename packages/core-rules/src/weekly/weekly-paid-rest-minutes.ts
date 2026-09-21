export interface WeeklyPaidRestMinutesInput {
  /** determineWeeklyPaidRest(...).eligible 결과를 그대로 주입 */
  eligible: boolean;
  /** 그 주 소정근로시간 합계(분) */
  weeklyScheduledMinutes: number;
  /** 그 주 소정근로일수 */
  scheduledWorkdayCount: number;
}

export interface WeeklyPaidRestMinutesBreakdownEntry {
  weeklyScheduledMinutes: number;
  scheduledWorkdayCount: number;
  perDayMinutesRounded: number;
}

export interface WeeklyPaidRestMinutesResult {
  minutes: number;
  breakdown: WeeklyPaidRestMinutesBreakdownEntry[];
}

/**
 * 주휴시간(주휴수당의 시간값) = 1일 소정근로시간 = 주 소정근로시간 ÷ 소정근로일수.
 * determineWeeklyPaidRest()는 대상 여부(boolean)만 반환하고 시간값이 없었다 —
 * 이 함수가 그 공백을 메운다(STEP11).
 *
 * 분단위 반올림 방향은 Math.round를 쓴다(임금에 직접 영향을 주는 값이라 사용자 확정).
 */
export function calculateWeeklyPaidRestMinutes(input: WeeklyPaidRestMinutesInput): WeeklyPaidRestMinutesResult {
  if (!input.eligible || input.scheduledWorkdayCount <= 0) {
    return { minutes: 0, breakdown: [] };
  }

  const perDayMinutesRounded = Math.round(input.weeklyScheduledMinutes / input.scheduledWorkdayCount);
  return {
    minutes: perDayMinutesRounded,
    breakdown: [
      {
        weeklyScheduledMinutes: input.weeklyScheduledMinutes,
        scheduledWorkdayCount: input.scheduledWorkdayCount,
        perDayMinutesRounded,
      },
    ],
  };
}
