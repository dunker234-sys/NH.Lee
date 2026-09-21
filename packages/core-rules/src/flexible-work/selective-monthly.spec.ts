import { calculateSelectiveMonthlySettlement } from './selective-monthly';

const worker = { isMinor: false, isPregnant: false };

describe('calculateSelectiveMonthlySettlement — 시나리오29 (선택적 1개월 정산)', () => {
  it('총 근로시간이 소정×근무일수를 초과한 만큼만 정산 대상이다', () => {
    const result = calculateSelectiveMonthlySettlement({
      worker,
      agreementInPlace: true,
      totalWorkedMinutes: 10_000,
      contractedDailyWorkMinutes: 480,
      workdayCount: 20, // 소정 총 9600분
    });
    expect(result.settlementMinutes).toBe(400);
  });

  it('초과분이 없으면 0이다', () => {
    const result = calculateSelectiveMonthlySettlement({
      worker,
      agreementInPlace: true,
      totalWorkedMinutes: 9000,
      contractedDailyWorkMinutes: 480,
      workdayCount: 20,
    });
    expect(result.settlementMinutes).toBe(0);
  });
});
