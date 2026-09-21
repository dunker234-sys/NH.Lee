import { requiredBreakMinutes, RequiredBreakPolicy } from '../break/required-break-minutes';

export interface PlannedBreakCheckInput {
  /** (계획 종료 - 계획 시작) - plannedBreakMinutes. 분 단위 정수 계산은 호출자 책임. */
  plannedWorkMinutes: number;
  plannedBreakMinutes: number;
  policy: RequiredBreakPolicy;
}

export interface PlannedBreakCheckResult {
  requiredMinutes: number;
  sufficient: boolean;
  shortfallMinutes: number;
}

/**
 * 계획 단계(타각 없음)에서 §54 휴게 충족 여부를 판정한다. 타각 기반
 * resolveBreak()과 달리 실제 BREAK_OUT/BREAK_IN이 존재하지 않으므로,
 * 계획된 근로시간에 대해 requiredBreakMinutes()가 요구하는 값과
 * 계획된 휴게시간을 단순 비교한다.
 */
export function checkPlannedBreakSufficiency(input: PlannedBreakCheckInput): PlannedBreakCheckResult {
  const requiredMinutes = requiredBreakMinutes(input.plannedWorkMinutes, input.policy);
  const shortfallMinutes = Math.max(0, requiredMinutes - input.plannedBreakMinutes);
  return { requiredMinutes, sufficient: shortfallMinutes === 0, shortfallMinutes };
}
