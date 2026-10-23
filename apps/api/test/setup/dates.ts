import { addDays } from '../../src/common/time/week.util';

/**
 * 정정 신청은 "근로일이 속한 달 종료 후 N일"까지만 가능하다(correctionRequestDeadlineDaysAfterMonthEnd,
 * 기본 10일). 고정 날짜(예: '2026-09-01')를 쓰는 테스트는 그 기한이 지나는 순간부터
 * 코드와 무관하게 실패한다 — 정정 신청 대상 근로일은 항상 오늘 기준 상대 날짜로 만든다.
 *
 * 서비스의 today()와 같은 기준(UTC 날짜)을 쓴다. daysAgo는 0~10 범위여야 항상 기한 안이다
 * (월말 + 10일 ≥ 근로일 + 10일).
 */
export function recentWorkDate(daysAgo: number): string {
  const today = new Date().toISOString().slice(0, 10);
  return addDays(today, -daysAgo);
}
