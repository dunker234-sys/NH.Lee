import { diffMinutes, isAfterOrEqual, isBefore } from './minutes';

export interface MinuteSegment {
  startAt: string;
  endAt: string;
}

export function segmentMinutes(segment: MinuteSegment): number {
  return diffMinutes(segment.startAt, segment.endAt);
}

/** 세그먼트를 주어진 경계 시각들에서 쪼갠다. 세그먼트 밖의 경계는 무시한다. */
export function splitAtBoundaries(segment: MinuteSegment, boundaries: string[]): MinuteSegment[] {
  const innerBoundaries = boundaries.filter(
    (b) => isAfterOrEqual(b, segment.startAt) && isBefore(b, segment.endAt) && b !== segment.startAt,
  );
  const points = [segment.startAt, ...innerBoundaries, segment.endAt].sort(
    (a, b) => Date.parse(a) - Date.parse(b),
  );

  const result: MinuteSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    if (points[i] !== points[i + 1]) {
      result.push({ startAt: points[i], endAt: points[i + 1] });
    }
  }
  return result;
}

/** base에서 toRemove 구간들을 제외한 나머지 구간을 시간순으로 반환한다(휴게 제외용). */
export function subtractSegments(base: MinuteSegment, toRemove: MinuteSegment[]): MinuteSegment[] {
  const sortedRemovals = toRemove
    .slice()
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  let remaining: MinuteSegment[] = [base];
  for (const removal of sortedRemovals) {
    const next: MinuteSegment[] = [];
    for (const seg of remaining) {
      const overlapStart = isAfterOrEqual(removal.startAt, seg.startAt) ? removal.startAt : seg.startAt;
      const overlapEnd = isBefore(removal.endAt, seg.endAt) ? removal.endAt : seg.endAt;
      if (isBefore(overlapStart, overlapEnd)) {
        if (isBefore(seg.startAt, overlapStart)) next.push({ startAt: seg.startAt, endAt: overlapStart });
        if (isBefore(overlapEnd, seg.endAt)) next.push({ startAt: overlapEnd, endAt: seg.endAt });
      } else {
        next.push(seg);
      }
    }
    remaining = next;
  }
  return remaining.filter((s) => diffMinutes(s.startAt, s.endAt) > 0);
}
