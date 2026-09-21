import { diffMinutes } from '../time/minutes';

/** 시나리오36: 지각 — 계획 시작보다 늦게 IN 타각이 찍힌 만큼(분). */
export function computeLatenessMinutes(scheduledStartAt: string | null, actualStartAt: string): number {
  if (!scheduledStartAt) return 0;
  return Date.parse(actualStartAt) > Date.parse(scheduledStartAt)
    ? diffMinutes(scheduledStartAt, actualStartAt)
    : 0;
}

/** 시나리오36: 조퇴 — 계획 종료보다 일찍 OUT 타각이 찍힌 만큼(분). */
export function computeEarlyLeaveMinutes(scheduledEndAt: string | null, actualEndAt: string): number {
  if (!scheduledEndAt) return 0;
  return Date.parse(actualEndAt) < Date.parse(scheduledEndAt) ? diffMinutes(actualEndAt, scheduledEndAt) : 0;
}
