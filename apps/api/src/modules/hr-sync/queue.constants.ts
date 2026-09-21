export const HR_SYNC_QUEUE_NAME = 'hr-sync';

/** 반복 잡(매일 새벽)은 asOfDate를 비워 둔다 — 컨슈머가 실행 시각 기준
 * "오늘"(KST)을 계산한다. 수동 트리거는 asOfDate를 명시적으로 넘긴다. */
export interface HrSyncJobData {
  asOfDate?: string;
  triggeredBy: 'SYSTEM' | 'MANUAL';
}
