import { PolicyConfig } from '../types/policy-config';

export interface WeeklyPaidRestInput {
  /** 그 주의 소정근로일별 개근(만근) 여부 */
  scheduledWorkdays: { date: string; fullyAttended: boolean }[];
  /** §18③ 초단시간 판정용 */
  fourWeekAverageWeeklyScheduledMinutes: number;
  policy: Pick<PolicyConfig, 'ultraPartTimeWeeklyThresholdMinutes'>;
}

export type WeeklyPaidRestReason = 'ULTRA_PART_TIME_EXEMPT' | 'FULL_ATTENDANCE' | 'INCOMPLETE_ATTENDANCE';

export interface WeeklyPaidRestResult {
  eligible: boolean;
  reason: WeeklyPaidRestReason;
}

/**
 * 주휴(§55①): 1주 소정근로일 전부 개근 시 발생한다. 4주 평균 1주 소정근로시간이
 * 초단시간 임계(기본 15h) 미만이면 개근 여부와 무관하게 미적용된다(§18③) —
 * 연차 미적용과 조문 근거는 같지만 판단 데이터(4주 평균 vs 계속근로 1년)가
 * 달라 annual-leave-applicability.ts와는 완전히 별도로 구현한다.
 */
export function determineWeeklyPaidRest(input: WeeklyPaidRestInput): WeeklyPaidRestResult {
  if (input.fourWeekAverageWeeklyScheduledMinutes < input.policy.ultraPartTimeWeeklyThresholdMinutes) {
    return { eligible: false, reason: 'ULTRA_PART_TIME_EXEMPT' };
  }

  const allAttended = input.scheduledWorkdays.every((d) => d.fullyAttended);
  return allAttended
    ? { eligible: true, reason: 'FULL_ATTENDANCE' }
    : { eligible: false, reason: 'INCOMPLETE_ATTENDANCE' };
}
