export const WEEKLY_RECALC_BATCH_QUEUE_NAME = 'weekly-recalc-batch';

/**
 * 이 큐는 잡 두 종류를 함께 쓴다(job.name으로 구분):
 * - 'trigger-nightly-batch': 팬아웃 신호. employeeId/weekStartDate 없음.
 * - 'recalculate-week': 팬아웃된 (직원×주) 실제 작업 단위.
 */
export interface WeeklyRecalcBatchJobData {
  employeeId?: string;
  weekStartDate?: string;
}

/** (직원, 주) 단위 체크포인트 — 같은 조합이 이미 큐에 있으면 중복 적재되지 않는다. */
export function weeklyRecalcBatchJobId(employeeId: string, weekStartDate: string): string {
  return `${employeeId}_${weekStartDate}`;
}
