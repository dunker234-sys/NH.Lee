export const MONTHLY_RECALC_BATCH_QUEUE_NAME = 'monthly-recalc-batch';

/**
 * weekly-recalc-batch.queue.constants.ts와 동일한 잡 2종 구조(job.name으로 구분):
 * - 'trigger-monthly-batch': 팬아웃 신호. employeeId/yearMonth 없음.
 * - 'recalculate-month': 팬아웃된 (직원×월) 실제 작업 단위.
 */
export interface MonthlyRecalcBatchJobData {
  employeeId?: string;
  yearMonth?: string;
}

/** (직원, 월) 단위 체크포인트 — 같은 조합이 이미 큐에 있으면 중복 적재되지 않는다. */
export function monthlyRecalcBatchJobId(employeeId: string, yearMonth: string): string {
  return `${employeeId}_${yearMonth}`;
}
