export interface RestGap {
  afterWorkDate: string;
  gapMinutes: number;
}

export interface ConsecutiveRestCheckResult {
  violated: boolean;
  reasons: string[];
  shortGaps: RestGap[];
}

/**
 * 근무일 사이 연속 휴식 확보 여부(§51의2②, §52②). 기존에는 semiannual.ts/
 * selective-monthly-excess.ts 안에만 인라인으로 존재했다 — STEP6이 계획근태
 * 전반(유연/선택 근로제 여부와 무관하게)에 적용할 수 있도록 범용 함수로
 * 분리한다.
 */
export function checkConsecutiveRestBetweenShifts(
  gaps: RestGap[],
  requiredMinutes: number,
): ConsecutiveRestCheckResult {
  const shortGaps = gaps.filter((gap) => gap.gapMinutes < requiredMinutes);
  const requiredHours = Math.floor(requiredMinutes / 60);
  const reasons = shortGaps.map(
    (gap) =>
      `${gap.afterWorkDate} 근무 이후 연속 휴식이 ${gap.gapMinutes}분으로, 기준(${requiredHours}시간/` +
      `${requiredMinutes}분)에 미달합니다(§51의2②, §52②).`,
  );
  return { violated: shortGaps.length > 0, reasons, shortGaps };
}
