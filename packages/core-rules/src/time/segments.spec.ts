import { segmentMinutes, splitAtBoundaries, subtractSegments } from './segments';

const t = (h: number, m = 0) => `2026-08-24T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

describe('splitAtBoundaries', () => {
  it('경계에서 세그먼트를 쪼갠다', () => {
    const result = splitAtBoundaries({ startAt: t(9), endAt: t(18) }, [t(12), t(13)]);
    expect(result).toEqual([
      { startAt: t(9), endAt: t(12) },
      { startAt: t(12), endAt: t(13) },
      { startAt: t(13), endAt: t(18) },
    ]);
  });

  it('세그먼트 밖의 경계는 무시한다', () => {
    const result = splitAtBoundaries({ startAt: t(9), endAt: t(18) }, [t(20)]);
    expect(result).toEqual([{ startAt: t(9), endAt: t(18) }]);
  });
});

describe('subtractSegments', () => {
  it('base와 겹치지 않는 제거 구간은 그대로 남는다', () => {
    const result = subtractSegments({ startAt: t(9), endAt: t(18) }, [{ startAt: t(20), endAt: t(21) }]);
    expect(result).toEqual([{ startAt: t(9), endAt: t(18) }]);
  });

  it('중간 구간을 제거하면 앞뒤로 분리된다', () => {
    const result = subtractSegments({ startAt: t(9), endAt: t(18) }, [{ startAt: t(12), endAt: t(13) }]);
    expect(result.map(segmentMinutes)).toEqual([180, 300]); // 9~12(3h), 13~18(5h)
  });
});
