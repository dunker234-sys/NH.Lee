export const NO_SHOW_DETECTION_QUEUE_NAME = 'no-show-detection';

/** 반복 잡(매일 KST 01:00)은 workDate를 비워 둔다 — 컨슈머가 실행 시각 기준
 * "어제"를 계산한다. 수동/테스트 트리거는 workDate를 명시적으로 넘긴다. */
export interface NoShowDetectionJobData {
  workDate?: string;
}
