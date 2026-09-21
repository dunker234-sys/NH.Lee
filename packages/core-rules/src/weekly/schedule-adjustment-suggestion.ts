export interface RemainingScheduleEntry {
  date: string;
  scheduledMinutes: number;
}

export interface ScheduleAdjustmentCandidate {
  date: string;
  originalMinutes: number;
  suggestedMinutes: number;
  reducedMinutes: number;
}

export interface ScheduleAdjustmentSuggestionResult {
  candidates: ScheduleAdjustmentCandidate[];
  totalReducedMinutes: number;
  /** reduceByMinutes를 전부 해소했는지. 남은 스케줄 총합이 부족하면 false —
   * 사업장 관리자가 대체 인력 투입 등 스케줄 조정 이외의 조치를 검토해야 한다. */
  fullyResolved: boolean;
}

/**
 * 예측 초과(요구사항서 4.4③)를 해소하기 위한 스케줄 조정 "후보"를 계산한다.
 * 근로자 동의 없이 자동 확정하지 않는다 — 사업장 관리자에게 후보로만
 * 제시한다. 가장 긴 근무일부터 줄인다: 여러 날에 걸쳐 조금씩 줄이는 것보다
 * 관리자가 한눈에 판단하기 쉽고, 근무일 자체가 없어지는 경우(0분)를
 * 최소화한다.
 */
export function suggestScheduleAdjustments(
  remainingSchedule: RemainingScheduleEntry[],
  reduceByMinutes: number,
): ScheduleAdjustmentSuggestionResult {
  const sortedByLongestFirst = [...remainingSchedule].sort((a, b) => b.scheduledMinutes - a.scheduledMinutes);
  let remainingToReduce = Math.max(0, reduceByMinutes);
  const reducedByDate = new Map<string, number>();

  for (const entry of sortedByLongestFirst) {
    if (remainingToReduce <= 0) break;
    const reduce = Math.min(entry.scheduledMinutes, remainingToReduce);
    if (reduce > 0) {
      reducedByDate.set(entry.date, reduce);
      remainingToReduce -= reduce;
    }
  }

  const candidates: ScheduleAdjustmentCandidate[] = remainingSchedule.map((entry) => {
    const reducedMinutes = reducedByDate.get(entry.date) ?? 0;
    return {
      date: entry.date,
      originalMinutes: entry.scheduledMinutes,
      suggestedMinutes: entry.scheduledMinutes - reducedMinutes,
      reducedMinutes,
    };
  });

  const totalReducedMinutes = candidates.reduce((sum, c) => sum + c.reducedMinutes, 0);

  return { candidates, totalReducedMinutes, fullyResolved: remainingToReduce <= 0 };
}
