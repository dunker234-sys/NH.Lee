import * as fs from 'fs';
import * as path from 'path';
import { calculateSelectiveMonthlyExcessSettlement } from './selective-monthly-excess';

const worker = { isMinor: false, isPregnant: false };
const policy = { continuousRestMinutes: 660, selectiveMonthlyOvertimePremiumRate: 0.5 };

describe('calculateSelectiveMonthlyExcessSettlement — 시나리오30 (선택적 1개월 초과정산)', () => {
  it('평균 40h 초과분과 가산율을 분리해 반환한다(분 단위 값에 배율을 곱하지 않음)', () => {
    const result = calculateSelectiveMonthlyExcessSettlement({
      worker,
      agreementInPlace: true,
      totalWorkedMinutes: 10_500,
      standardMinutes: 9_600, // 40h × 4주
      restGapsMinutes: [700, 700],
      policy,
    });
    expect(result.excessMinutes).toBe(900);
    expect(result.premiumRate).toBe(0.5);
    expect(result.restViolation).toBe(false);
  });

  it('연속 11시간 휴식 미확보 시 restViolation=true', () => {
    const result = calculateSelectiveMonthlyExcessSettlement({
      worker,
      agreementInPlace: true,
      totalWorkedMinutes: 9_600,
      standardMinutes: 9_600,
      restGapsMinutes: [600],
      policy,
    });
    expect(result.restViolation).toBe(true);
  });

  it('§56①(weekly-overtime-pay)을 import하지 않는다 — TS 모듈 시스템상 import 없이는 호출도 불가능하다', () => {
    // 주석에서는 "왜 안 쓰는지" 설명을 위해 이름을 언급할 수 있으므로, import 구문
    // 존재 여부만 검사한다(실제 호출 가능성의 필요조건).
    const source = fs.readFileSync(path.join(__dirname, 'selective-monthly-excess.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import[^;]*from\s+['"].*weekly-overtime-pay['"]/m);
  });
});
