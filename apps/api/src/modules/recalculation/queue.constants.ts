export const RECALCULATION_QUEUE_NAME = 'attendance-recalculation';

/** reason은 어떤 트리거가 이 재계산을 요청했는지 감사·디버깅 목적으로만 기록한다. */
export interface RecalculationJobData {
  employeeId: string;
  workDate: string;
  reason: string;
}

/**
 * 같은 (직원, 근로일)의 잡을 자연스럽게 중복 제거하기 위한 고정 잡 ID.
 * BullMQ 커스텀 잡 ID는 내부 키 구분자와 겹치는 ':'를 허용하지 않는다 — '_'로 구분한다.
 */
export function recalculationJobId(employeeId: string, workDate: string): string {
  return `${employeeId}_${workDate}`;
}
