export type WeeklyAlertStage = 'NONE' | 'ATTENTION' | 'WARNING' | 'DANGER' | 'EXCEEDED';

/**
 * 요구사항서 4.4② 알림 임계값. 45h/48h/50h와 70%/85%/95%는 법령 수치가 아니라
 * 회사 운영 정책이지만, CLAUDE.md 절대 규칙4에 따라 이 패키지는 여전히
 * 하드코딩하지 않고 호출자(policy_config)로부터 주입받는다.
 */
export interface WeeklyAlertThresholdPolicy {
  /** 720(12h) — §53① 연장근로 한도. 상대값 임계 계산에 쓰인다. */
  weeklyOvertimeCapMinutes: number;
  attentionAbsoluteMinutes: number; // 2700 (45h)
  attentionRelativeRatio: number; // 0.70
  warningAbsoluteMinutes: number; // 2880 (48h)
  warningRelativeRatio: number; // 0.85
  dangerAbsoluteMinutes: number; // 3000 (50h)
  dangerRelativeRatio: number; // 0.95
}

export interface WeeklyAlertStageInput {
  /** 미승인 포함 실적 주간 총합(분) — AttendanceWeekly.totalWorkMinutes와 대응. */
  actualWeeklyMinutes: number;
  /** 소정근로시간(주, 분). 단시간 근로자는 40h(2400분) 미만일 수 있다. */
  contractedWeeklyMinutes: number;
  /**
   * checkWeeklyLimitViolation()의 판정 결과. "초과" 단계는 이 값을 그대로
   * 재사용한다 — 별도 산식을 만들지 않는다(대법 2020도15393, 요구사항서 4.4①).
   */
  limitViolated: boolean;
  policy: WeeklyAlertThresholdPolicy;
}

export interface WeeklyAlertThresholdBreakdown {
  stage: 'ATTENTION' | 'WARNING' | 'DANGER';
  absoluteMinutes: number;
  relativeMinutes: number;
  /** MIN(absoluteMinutes, relativeMinutes) — 먼저 도달하는 쪽. */
  effectiveThresholdMinutes: number;
  reachedBy: 'ABSOLUTE' | 'RELATIVE';
}

export interface WeeklyAlertStageResult {
  stage: WeeklyAlertStage;
  /** 주의/경고/위험 3단계 전부의 산출 근거 — 감사·디버깅용(breakdown 관례). */
  thresholds: WeeklyAlertThresholdBreakdown[];
}

function buildThreshold(
  stage: WeeklyAlertThresholdBreakdown['stage'],
  absoluteMinutes: number,
  relativeRatio: number,
  contractedWeeklyMinutes: number,
  weeklyOvertimeCapMinutes: number,
): WeeklyAlertThresholdBreakdown {
  // ratio는 0.7/0.85/0.95처럼 소수지만 곱셈 결과는 정수 분으로 반올림한다
  // (CLAUDE.md 절대 규칙6 — 시간 계산에 부동소수점 잔여를 남기지 않는다).
  const relativeMinutes = contractedWeeklyMinutes + Math.round(weeklyOvertimeCapMinutes * relativeRatio);
  const effectiveThresholdMinutes = Math.min(absoluteMinutes, relativeMinutes);
  return {
    stage,
    absoluteMinutes,
    relativeMinutes,
    effectiveThresholdMinutes,
    reachedBy: effectiveThresholdMinutes === absoluteMinutes ? 'ABSOLUTE' : 'RELATIVE',
  };
}

/**
 * 절대값·상대값 병행 알림 단계 판정(요구사항서 4.4②). 소정근로시간이 낮은
 * 단시간 근로자는 상대값 임계가 절대값보다 먼저 도달해 "침묵"하지 않는다
 * (예: 소정 20h 근로자는 32h에서 이미 위험 단계 — 절대값 45h만 썼다면 놓쳤을 사례).
 *
 * "초과" 단계는 별도 산식이 아니라 checkWeeklyLimitViolation()의 결과를
 * 그대로 받아 최우선 적용한다 — 요구사항서 4.4①의 한도위반 판정과 알림
 * 단계 판정이 서로 다른 두 산식이 되지 않도록 하기 위해서다.
 */
export function determineWeeklyAlertStage(input: WeeklyAlertStageInput): WeeklyAlertStageResult {
  const { actualWeeklyMinutes, contractedWeeklyMinutes, limitViolated, policy } = input;

  const thresholds: WeeklyAlertThresholdBreakdown[] = [
    buildThreshold('ATTENTION', policy.attentionAbsoluteMinutes, policy.attentionRelativeRatio, contractedWeeklyMinutes, policy.weeklyOvertimeCapMinutes),
    buildThreshold('WARNING', policy.warningAbsoluteMinutes, policy.warningRelativeRatio, contractedWeeklyMinutes, policy.weeklyOvertimeCapMinutes),
    buildThreshold('DANGER', policy.dangerAbsoluteMinutes, policy.dangerRelativeRatio, contractedWeeklyMinutes, policy.weeklyOvertimeCapMinutes),
  ];

  let stage: WeeklyAlertStage = 'NONE';
  for (const threshold of thresholds) {
    if (actualWeeklyMinutes >= threshold.effectiveThresholdMinutes) stage = threshold.stage;
  }
  if (limitViolated) stage = 'EXCEEDED';

  return { stage, thresholds };
}
