import { checkPlannedBreakSufficiency } from './planned-break-check';
import { RequiredBreakPolicy } from '../break/required-break-minutes';

const policy: RequiredBreakPolicy = {
  breakTierThresholdMinutes: 240,
  breakTierMinutes: 30,
  breakFullTierThresholdMinutes: 480,
  breakFullTierMinutes: 60,
  dailyStatutoryLimitMinutes: 480,
};

describe('checkPlannedBreakSufficiency', () => {
  it('4시간 미만 계획 근로는 휴게가 없어도 충분하다', () => {
    const result = checkPlannedBreakSufficiency({ plannedWorkMinutes: 239, plannedBreakMinutes: 0, policy });
    expect(result.requiredMinutes).toBe(0);
    expect(result.sufficient).toBe(true);
    expect(result.shortfallMinutes).toBe(0);
  });

  it('4시간 이상인데 휴게를 전혀 계획하지 않으면 부족(미부여)으로 판정한다', () => {
    const result = checkPlannedBreakSufficiency({ plannedWorkMinutes: 240, plannedBreakMinutes: 0, policy });
    expect(result.requiredMinutes).toBe(30);
    expect(result.sufficient).toBe(false);
    expect(result.shortfallMinutes).toBe(30);
  });

  it('필요한 만큼 계획했으면 충분하다', () => {
    const result = checkPlannedBreakSufficiency({ plannedWorkMinutes: 480, plannedBreakMinutes: 60, policy });
    expect(result.sufficient).toBe(true);
    expect(result.shortfallMinutes).toBe(0);
  });

  it('연장구간을 포함한 8시간 초과 근로도 부족분을 정확히 계산한다', () => {
    // 720분 = 법정60 + 연장(240→30) = 90분 필요, 30분만 계획 → 60분 부족.
    const result = checkPlannedBreakSufficiency({ plannedWorkMinutes: 720, plannedBreakMinutes: 30, policy });
    expect(result.requiredMinutes).toBe(90);
    expect(result.sufficient).toBe(false);
    expect(result.shortfallMinutes).toBe(60);
  });
});
