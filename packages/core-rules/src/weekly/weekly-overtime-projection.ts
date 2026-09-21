import { PolicyConfig } from '../types/policy-config';
import { checkWeeklyLimitViolation, DailyTotal } from './weekly-limit-violation';
import { determineWeeklyAlertStage, WeeklyAlertStage, WeeklyAlertThresholdPolicy } from './weekly-alert-stage';

export interface WeeklyOvertimeProjectionInput {
  /** 이번 주 중 이미 지난 날짜의 실적(미승인 포함). */
  actualDailyTotals: DailyTotal[];
  /** 이번 주 중 아직 지나지 않은 날짜의 계획근태(분). */
  remainingScheduledDailyTotals: DailyTotal[];
  contractedWeeklyMinutes: number;
  policy: Pick<PolicyConfig, 'weeklyStatutoryLimitMinutes' | 'weeklyOvertimeCapMinutes'> & WeeklyAlertThresholdPolicy;
}

export interface WeeklyOvertimeProjectionResult {
  projectedTotalMinutes: number;
  projectedExcessOver40Minutes: number;
  /** checkWeeklyLimitViolation과 같은 기준(§53①)을 실적+계획 합산에 적용한 예측값. */
  projectedViolation: boolean;
  projectedStage: WeeklyAlertStage;
  /** 아직 확정된 실적 판정이 아니라 계획 기반 "예측"이라는 걸 호출부가 혼동하지 않도록 명시한다. */
  isProjection: true;
}

/**
 * 예측 알림(요구사항서 4.4③): 남은 계획근태를 실적에 합산했을 때 초과가
 * 예상되면 사업장 관리자에게 사전 경고한다. checkWeeklyLimitViolation/
 * determineWeeklyAlertStage를 그대로 재사용해 "예측"과 "실적 판정"이
 * 서로 다른 산식이 되지 않게 한다 — 계획이 실적으로 바뀌는 순간 같은
 * 함수로 같은 결과가 나와야 한다.
 */
export function projectWeeklyOvertime(input: WeeklyOvertimeProjectionInput): WeeklyOvertimeProjectionResult {
  const combinedTotals: DailyTotal[] = [...input.actualDailyTotals, ...input.remainingScheduledDailyTotals];
  const limitResult = checkWeeklyLimitViolation({ dailyTotals: combinedTotals, policy: input.policy });
  const stageResult = determineWeeklyAlertStage({
    actualWeeklyMinutes: limitResult.weeklyTotalMinutes,
    contractedWeeklyMinutes: input.contractedWeeklyMinutes,
    limitViolated: limitResult.violated,
    policy: input.policy,
  });

  return {
    projectedTotalMinutes: limitResult.weeklyTotalMinutes,
    projectedExcessOver40Minutes: limitResult.excessOver40Minutes,
    projectedViolation: limitResult.violated,
    projectedStage: stageResult.stage,
    isProjection: true,
  };
}
