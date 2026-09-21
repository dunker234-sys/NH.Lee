import { PunchEvent } from '../types/inputs';
import { PolicyConfig } from '../types/policy-config';
import { ReviewFlag } from '../types/results';
import { CircularBreakContradictionError } from '../types/errors';
import { addMinutes, diffMinutes } from '../time/minutes';
import { MinuteSegment, segmentMinutes } from '../time/segments';
import { requiredBreakMinutes } from './required-break-minutes';

type BreakPolicy = Pick<
  PolicyConfig,
  | 'breakTierThresholdMinutes'
  | 'breakTierMinutes'
  | 'breakFullTierThresholdMinutes'
  | 'breakFullTierMinutes'
  | 'dailyStatutoryLimitMinutes'
>;

export interface BreakResolutionInput {
  stayStartAt: string;
  stayEndAt: string;
  /** IN/OUT을 포함해 그날 전체 타각을 넘겨도 된다 — BREAK_OUT/BREAK_IN만 걸러 쓴다. */
  punches: PunchEvent[];
  scheduledBreakSegments: MinuteSegment[];
  breakNotGrantedReported: boolean;
  policy: BreakPolicy;
}

export interface BreakResolutionResult {
  breakMinutes: number;
  /** 실제로 공제된 구간(있다면). premium-rate가 근무 타임라인에서 이 구간을 제외하는 데 쓴다. */
  breakSegments: MinuteSegment[];
  reviewFlags: ReviewFlag[];
  warnings: string[];
}

/**
 * 체류시간 S만으로 자기일관적인 휴게시간 b를 찾는다: W = S - b일 때
 * requiredBreakMinutes(W) === b를 만족하는 b. 후보는 requiredBreakMinutes의
 * 치역인 계단값들이다(0, 30, 60, 90, 120 — 16시간 교대까지 커버, 그 이상은
 * 이 도메인에서 비현실적이라 다루지 않는다). 어떤 후보도 자기일관적이지
 * 않으면 시나리오10의 "순환모순"이다.
 */
function resolveConsistentBreak(stayMinutes: number, policy: BreakPolicy): number {
  const candidates = [
    0,
    policy.breakTierMinutes,
    policy.breakFullTierMinutes,
    policy.breakFullTierMinutes + policy.breakTierMinutes,
    policy.breakFullTierMinutes + policy.breakFullTierMinutes,
  ].sort((a, b) => a - b);

  for (const b of candidates) {
    const workMinutes = stayMinutes - b;
    if (workMinutes >= 0 && requiredBreakMinutes(workMinutes, policy) === b) {
      return b;
    }
  }
  throw new CircularBreakContradictionError(stayMinutes);
}

interface BreakPair {
  outAt: string;
  inAt: string | null;
}

function pairBreakPunches(punches: PunchEvent[]): BreakPair[] {
  const sorted = punches
    .filter((p) => p.type === 'BREAK_OUT' || p.type === 'BREAK_IN')
    .slice()
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));

  const pairs: BreakPair[] = [];
  let pendingOut: string | null = null;
  for (const p of sorted) {
    if (p.type === 'BREAK_OUT') {
      if (pendingOut) pairs.push({ outAt: pendingOut, inAt: null }); // 이전 OUT이 짝 없이 마감
      pendingOut = p.recordedAt;
    } else if (p.type === 'BREAK_IN' && pendingOut) {
      pairs.push({ outAt: pendingOut, inAt: p.recordedAt });
      pendingOut = null;
    }
    // pendingOut 없이 BREAK_IN만 있는 경우는 기형 데이터로 무시한다(멱등 처리된 정상
    // 타각 스트림에서는 발생하지 않는다고 가정).
  }
  if (pendingOut) pairs.push({ outAt: pendingOut, inAt: null });
  return pairs;
}

export function resolveBreak(input: BreakResolutionInput): BreakResolutionResult {
  const { policy } = input;
  const breakPunches = input.punches.filter((p) => p.type === 'BREAK_OUT' || p.type === 'BREAK_IN');

  let breakMinutes: number;
  let breakSegments: MinuteSegment[];
  const reviewFlags: ReviewFlag[] = [];
  const warnings: string[] = [];

  if (breakPunches.length > 0) {
    // 실제 타각이 있으면 스케줄은 완전히 무시한다(시나리오8).
    const pairs = pairBreakPunches(breakPunches);
    breakSegments = pairs
      .filter((p): p is { outAt: string; inAt: string } => p.inAt !== null)
      .map((p) => ({ startAt: p.outAt, endAt: p.inAt }));
    breakMinutes = breakSegments.reduce((sum, seg) => sum + segmentMinutes(seg), 0);

    if (pairs.some((p) => p.inAt === null)) {
      reviewFlags.push('BREAK_IN_MISSING');
      warnings.push(
        'BREAK_OUT 타각 이후 BREAK_IN 없이 근무가 종료되었습니다. 실근로를 휴게로 처리하지 않고 ' +
          '공제 없이 검토 큐로 보냅니다.',
      );
    }
  } else if (input.breakNotGrantedReported) {
    breakMinutes = 0;
    breakSegments = [];
    reviewFlags.push('BREAK_NOT_GRANTED');
    warnings.push('근로자가 휴게 미부여를 신고했습니다. 휴게를 공제하지 않고 검토 큐로 보냅니다.');

    return { breakMinutes, breakSegments, reviewFlags, warnings };
  } else {
    const stayMinutes = diffMinutes(input.stayStartAt, input.stayEndAt);
    breakMinutes = resolveConsistentBreak(stayMinutes, policy);
    // breakMinutes(수치)와 breakSegments(실제 제외 구간)가 항상 일치해야 한다 —
    // 그렇지 않으면 이 구간이 근무 타임라인에서 실제로 빠지지 않아 actualWorkMinutes가
    // 어긋난다. 스케줄에 휴게 구간이 있으면 그 시작점을 기준으로, 없으면 체류 시작을
    // 기준으로 합성한다(실제 세계에서는 스케줄이 항상 있다고 기대하지만, 없는
    // 입력에서도 수치 불일치가 나면 안 된다).
    const anchor = input.scheduledBreakSegments[0]?.startAt ?? input.stayStartAt;
    breakSegments = breakMinutes > 0 ? [{ startAt: anchor, endAt: addMinutes(anchor, breakMinutes) }] : [];
  }

  // 휴게 미부여 경고(시나리오9): 강제로 더 빼지 않는다. 대법원 2020도15393.
  const stayMinutes = diffMinutes(input.stayStartAt, input.stayEndAt);
  const workMinutes = stayMinutes - breakMinutes;
  const required = requiredBreakMinutes(workMinutes, policy);
  if (breakMinutes < required) {
    reviewFlags.push('BREAK_UNDER_PROVIDED');
    warnings.push(
      `제공된 휴게(${breakMinutes}분)가 §54 기준 필요 휴게(${required}분)에 미달합니다 ` +
        '(대법원 2020도15393 — 연장구간에도 별도 휴게가 추가로 부여되어야 합니다). ' +
        '휴게시간을 임의로 늘려 공제하지는 않습니다.',
    );
  }

  return { breakMinutes, breakSegments, reviewFlags, warnings };
}
