/**
 * packages/core-rules의 계산 알고리즘이 실질적으로 바뀔 때만 수동으로 올린다.
 * 매 재계산마다 증가하는 카운터가 아니다 — 그래야 "동일 입력을 여러 번
 * 실행해도 calculatedAt을 제외한 모든 필드가 동일하다"는 멱등성이 성립한다.
 */
export const CALC_ENGINE_VERSION = 1;
