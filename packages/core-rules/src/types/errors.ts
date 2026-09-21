/**
 * 계산 엔진 에러 계층. 입력이 잘못되면 조용히 0을 반환하지 말고 명시적
 * 에러 또는 PENDING을 반환한다(CLAUDE.md, 이 STEP 구현요구사항).
 */
export abstract class CoreRulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** 시나리오10: 체류시간에서 휴게를 뺀 근로시간이 §54 기준과 자기모순되는 경우. */
export class CircularBreakContradictionError extends CoreRulesError {
  constructor(stayMinutes: number) {
    super(
      `체류시간 ${stayMinutes}분에 대해 §54 기준을 만족하는 휴게시간을 도출할 수 없습니다 ` +
        `(순환모순 — 어떤 휴게 후보도 자기 자신을 다시 도출하지 않습니다).`,
    );
  }
}

/** IN 타각 없이 계산을 시도한 경우. */
export class MissingClockInError extends CoreRulesError {
  constructor() {
    super('IN(출근) 타각이 없어 근로시간을 계산할 수 없습니다.');
  }
}

/** 시나리오32: 미성년/임신 중 근로자에게 유연근로제를 적용하려는 시도. */
export class FlexibleWorkNotEligibleError extends CoreRulesError {
  constructor(reason: 'MINOR' | 'PREGNANT') {
    super(
      reason === 'MINOR'
        ? '18세 미만 근로자에게는 탄력적/선택적 근로시간제를 적용할 수 없습니다.'
        : '임신 중인 근로자에게는 탄력적/선택적 근로시간제를 적용할 수 없습니다.',
    );
  }
}

/** 시나리오40: labor_agreement/work_rule 근거 없이 유연근로제를 적용하려는 시도. */
export class FlexibleWorkAgreementMissingError extends CoreRulesError {
  constructor() {
    super(
      '근로자대표 서면합의(labor_agreement) 또는 취업규칙(work_rule) 근거가 없어 ' +
        '유연근로제를 적용할 수 없습니다. 설정만으로는 활성화되지 않습니다.',
    );
  }
}

/** 입력값 자체가 물리적으로 불가능한 경우(예: OUT이 IN보다 앞섬). */
export class InvalidCalculationInputError extends CoreRulesError {}
