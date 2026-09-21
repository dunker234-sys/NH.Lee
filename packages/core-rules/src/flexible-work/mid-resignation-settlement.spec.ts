import { calculateMidResignationSettlement } from './mid-resignation-settlement';

const policy = { weeklyStatutoryLimitMinutes: 2400 };

describe('calculateMidResignationSettlement — 시나리오31 (중도 퇴사자 정산)', () => {
  it('근로한 각 주의 40h 초과분 전부가 안분 없이 가산 대상이다', () => {
    const result = calculateMidResignationSettlement({
      weeklyTotals: [
        { weekStartDate: 'w1', totalMinutes: 2700 }, // 45h → 초과5h
        { weekStartDate: 'w2', totalMinutes: 2100 }, // 35h → 초과없음
        { weekStartDate: 'w3', totalMinutes: 3000 }, // 50h → 초과10h
      ],
      policy,
    });
    expect(result.weeklyExcess.map((w) => w.excessMinutes)).toEqual([300, 0, 600]);
    expect(result.totalExcessMinutes).toBe(900); // 15h, 정산기간 평균으로 축소되지 않는다
  });
});
