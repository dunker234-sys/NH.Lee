export interface ConsecutiveWorkdayRun {
  startDate: string;
  endDate: string;
  lengthDays: number;
}

export interface ConsecutiveWorkdayCheckInput {
  /** 정렬된, 중복 없는 근무일(YYYY-MM-DD) 목록. 후보 구간 전체(월 경계 밖도
   * 포함)를 호출자가 넘겨야 정확하다 — 이 함수는 달력을 모른다, 문자열
   * 순서만 본다. */
  workDates: string[];
  maxConsecutiveDays: number;
}

export interface ConsecutiveWorkdayCheckResult {
  violated: boolean;
  reasons: string[];
  runs: ConsecutiveWorkdayRun[];
}

function isNextCalendarDay(prev: string, cur: string): boolean {
  const prevMs = Date.parse(`${prev}T00:00:00.000Z`);
  const curMs = Date.parse(`${cur}T00:00:00.000Z`);
  return curMs - prevMs === 24 * 60 * 60 * 1000;
}

/** 연속 근무일수 상한 위반 판정(코어룰즈에 전무했던 신규 규칙, STEP6). */
export function checkConsecutiveWorkdayLimit(input: ConsecutiveWorkdayCheckInput): ConsecutiveWorkdayCheckResult {
  const runs: ConsecutiveWorkdayRun[] = [];
  let runStart: string | null = null;
  let runLength = 0;
  let prev: string | null = null;

  const flushIfOverLimit = (endDate: string): void => {
    if (runStart !== null && runLength > input.maxConsecutiveDays) {
      runs.push({ startDate: runStart, endDate, lengthDays: runLength });
    }
  };

  for (const date of input.workDates) {
    if (prev !== null && isNextCalendarDay(prev, date)) {
      runLength += 1;
    } else {
      if (prev !== null) flushIfOverLimit(prev);
      runStart = date;
      runLength = 1;
    }
    prev = date;
  }
  if (prev !== null) flushIfOverLimit(prev);

  const reasons = runs.map(
    (run) =>
      `${run.startDate}부터 ${run.endDate}까지 ${run.lengthDays}일 연속 근무해 상한(${input.maxConsecutiveDays}일)을 초과했습니다.`,
  );
  return { violated: runs.length > 0, reasons, runs };
}
