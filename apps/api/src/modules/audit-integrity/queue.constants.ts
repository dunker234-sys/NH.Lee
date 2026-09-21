export const AUDIT_MERKLE_SEAL_QUEUE_NAME = 'audit-merkle-seal';

/** 반복 잡(매시 5분)은 periodStart를 비워 둔다 — 컨슈머가 실행 시각 기준
 * "완전히 지난 직전 1시간"을 계산한다. 수동/테스트 트리거는 명시적으로 넘긴다. */
export interface AuditMerkleSealJobData {
  periodStart?: string; // ISO instant, 그 시(hour)의 시작
}
