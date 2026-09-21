import { determineWeeklyAlertStage, WeeklyAlertThresholdPolicy } from './weekly-alert-stage';

// 요구사항서 4.4②의 기본 운영값(실제 값은 policy_config에서 주입 — CLAUDE.md 절대 규칙4).
const policy: WeeklyAlertThresholdPolicy = {
  weeklyOvertimeCapMinutes: 720, // 12h
  attentionAbsoluteMinutes: 2700, // 45h
  attentionRelativeRatio: 0.7,
  warningAbsoluteMinutes: 2880, // 48h
  warningRelativeRatio: 0.85,
  dangerAbsoluteMinutes: 3000, // 50h
  dangerRelativeRatio: 0.95,
};

describe('determineWeeklyAlertStage — 요구사항서 4.4② 절대값·상대값 병행, 먼저 도달하는 쪽', () => {
  it('40h 소정 근로자: 45h 미만이면 알림 없음', () => {
    const result = determineWeeklyAlertStage({
      actualWeeklyMinutes: 2699,
      contractedWeeklyMinutes: 2400,
      limitViolated: false,
      policy,
    });
    expect(result.stage).toBe('NONE');
  });

  it('40h 소정 근로자: 45h 도달 시 주의(절대값이 상대값보다 먼저 도달)', () => {
    const result = determineWeeklyAlertStage({
      actualWeeklyMinutes: 2700,
      contractedWeeklyMinutes: 2400,
      limitViolated: false,
      policy,
    });
    expect(result.stage).toBe('ATTENTION');
    const attention = result.thresholds.find((t) => t.stage === 'ATTENTION')!;
    expect(attention.effectiveThresholdMinutes).toBe(2700);
    expect(attention.reachedBy).toBe('ABSOLUTE');
  });

  it('40h 소정 근로자: 48h 경고, 50h 위험, 52h 초과(한도위반과 동일 조건)', () => {
    expect(
      determineWeeklyAlertStage({ actualWeeklyMinutes: 2880, contractedWeeklyMinutes: 2400, limitViolated: false, policy }).stage,
    ).toBe('WARNING');
    expect(
      determineWeeklyAlertStage({ actualWeeklyMinutes: 3000, contractedWeeklyMinutes: 2400, limitViolated: false, policy }).stage,
    ).toBe('DANGER');
    expect(
      determineWeeklyAlertStage({ actualWeeklyMinutes: 3121, contractedWeeklyMinutes: 2400, limitViolated: true, policy }).stage,
    ).toBe('EXCEEDED');
  });

  it('완료조건: 소정 20h(1200분) 근로자가 32h(1920분)에서 위험 단계 알림을 받는다 — 절대값 45h만 쓰면 침묵했을 사례', () => {
    const result = determineWeeklyAlertStage({
      actualWeeklyMinutes: 1920,
      contractedWeeklyMinutes: 1200,
      limitViolated: false, // 40h 기준 한도위반은 아직 아님(§53① 별도 판정)
      policy,
    });
    expect(result.stage).toBe('DANGER');
    const danger = result.thresholds.find((t) => t.stage === 'DANGER')!;
    expect(danger.effectiveThresholdMinutes).toBe(1884); // min(3000, 1200+720*0.95=1884)
    expect(danger.reachedBy).toBe('RELATIVE');
  });

  it('소정 20h 근로자: 상대값 임계 이전(주의 임계 1704분 미만)에는 알림 없음', () => {
    const result = determineWeeklyAlertStage({
      actualWeeklyMinutes: 1700,
      contractedWeeklyMinutes: 1200,
      limitViolated: false,
      policy,
    });
    expect(result.stage).toBe('NONE');
  });

  it('limitViolated=true면 다른 임계와 무관하게 EXCEEDED로 덮어쓴다(형사처벌 대상이 가장 심각)', () => {
    const result = determineWeeklyAlertStage({
      actualWeeklyMinutes: 500, // 임계 자체는 전혀 도달 못 했더라도
      contractedWeeklyMinutes: 2400,
      limitViolated: true,
      policy,
    });
    expect(result.stage).toBe('EXCEEDED');
  });

  it('경계값: effectiveThresholdMinutes 정확히 그 값에서 그 단계로 판정된다(>=)', () => {
    const result = determineWeeklyAlertStage({
      actualWeeklyMinutes: 2879,
      contractedWeeklyMinutes: 2400,
      limitViolated: false,
      policy,
    });
    expect(result.stage).toBe('ATTENTION');
  });
});
