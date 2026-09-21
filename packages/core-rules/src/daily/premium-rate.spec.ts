import { PolicyConfig } from '../types/policy-config';
import { computePremiumBreakdown } from './premium-rate';
import { attributeNightAndHoliday } from './night-holiday-attribution';

const policy: Pick<
  PolicyConfig,
  | 'dailyStatutoryLimitMinutes'
  | 'overtimePremiumRate'
  | 'nightPremiumRate'
  | 'holidayPremiumRateWithin8h'
  | 'holidayPremiumRateExcess8h'
  | 'nightStartMinuteOfDay'
  | 'nightEndMinuteOfDay'
> = {
  dailyStatutoryLimitMinutes: 480,
  overtimePremiumRate: 0.5,
  nightPremiumRate: 0.5,
  holidayPremiumRateWithin8h: 0.5,
  holidayPremiumRateExcess8h: 1.0,
  nightStartMinuteOfDay: 22 * 60,
  nightEndMinuteOfDay: 6 * 60,
};

const D = '2026-08-24';
// KST 시각을 UTC 인스턴트로 환산한다(KST=UTC+9). hour=24(자정 넘김) 표기도 그대로 지원한다
// (Date.UTC가 시/분 오버플로를 자동으로 정규화한다).
function kst(hhmm: string, day: string = D): string {
  const [year, month, dateNum] = day.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, dateNum, hour - 9, minute)).toISOString();
}

function attribute(startHHMM: string, endHHMM: string, holidayByDate: { calendarDate: string; isHoliday: boolean }[], day = D) {
  return attributeNightAndHoliday({ startAt: kst(startHHMM, day), endAt: kst(endHHMM, day) }, holidayByDate, policy);
}

describe('시나리오14: 13:00~24:00 근무(휴게 1h 이미 제외됐다고 가정), 22:00~24:00은 연장+야간 100% 가산', () => {
  it('22:00~24:00 구간의 지급배율이 2.0(연장50%+야간50%)이다', () => {
    const segments = attribute('13:00', '24:00', [{ calendarDate: D, isHoliday: false }]);
    const breakdown = computePremiumBreakdown({
      segments,
      isUnderFiveEmployees: false,
      overtimeApproved: true,
      policy,
    });

    const nightOvertime = breakdown.find((e) => e.payBucket === 'OVERTIME' && e.flags.night);
    expect(nightOvertime).toBeDefined();
    expect(nightOvertime?.rateMultiplier).toBe(2.0);
    expect(nightOvertime?.minutes).toBe(120);

    const dayOvertime = breakdown.find((e) => e.payBucket === 'OVERTIME' && !e.flags.night);
    expect(dayOvertime?.rateMultiplier).toBe(1.5);
    expect(dayOvertime?.minutes).toBe(60); // 13:00~21:00 소정 8h 이후, 21:00~22:00
  });
});

describe('시나리오15: 휴일 10h 근로 — 8h는 +50%, 초과 2h는 +100%(연장 별도가산 없음)', () => {
  it('휴일 08:00~18:00(휴게 없음, 10h)에서 8h는 1.5배, 2h는 2.0배다', () => {
    const segments = attribute('08:00', '18:00', [{ calendarDate: D, isHoliday: true }]);
    const breakdown = computePremiumBreakdown({ segments, isUnderFiveEmployees: false, overtimeApproved: true, policy });

    const normal = breakdown.find((e) => e.payBucket === 'HOLIDAY_NORMAL');
    const excess = breakdown.find((e) => e.payBucket === 'HOLIDAY_EXCESS');
    expect(normal?.minutes).toBe(480);
    expect(normal?.rateMultiplier).toBe(1.5);
    expect(excess?.minutes).toBe(120);
    expect(excess?.rateMultiplier).toBe(2.0); // 2.5가 아니다 — 연장 50%를 별도로 더하지 않는다
  });
});

describe('시나리오16: 휴일근로가 22:00을 넘으면 그 구간에 야간 +50%가 추가된다', () => {
  it('휴일 14:00~24:00(10h)에서 22:00~24:00(휴일초과+야간)은 2.5배다', () => {
    const segments = attribute('14:00', '24:00', [{ calendarDate: D, isHoliday: true }]);
    const breakdown = computePremiumBreakdown({ segments, isUnderFiveEmployees: false, overtimeApproved: true, policy });

    const nightExcess = breakdown.find((e) => e.payBucket === 'HOLIDAY_EXCESS' && e.flags.night);
    expect(nightExcess).toBeDefined();
    expect(nightExcess?.rateMultiplier).toBe(2.5);
  });
});

describe('시나리오23: 5인 미만 — 가산은 없지만 payBucket/야간 분류는 그대로 유지된다', () => {
  it('연장+야간 구간도 배율은 1.0이지만 payBucket=OVERTIME, flags.night=true는 유지', () => {
    const segments = attribute('13:00', '24:00', [{ calendarDate: D, isHoliday: false }]);
    const breakdown = computePremiumBreakdown({ segments, isUnderFiveEmployees: true, overtimeApproved: true, policy });

    const nightOvertime = breakdown.find((e) => e.payBucket === 'OVERTIME' && e.flags.night);
    expect(nightOvertime?.rateMultiplier).toBe(1.0);
    expect(nightOvertime?.minutes).toBe(120);
  });
});

describe('승인 여부는 rateMultiplier에 영향을 주지 않는다', () => {
  it('미승인 연장도 승인 연장과 동일한 배율(1.5)이고, approvalStatus만 다르다', () => {
    // 이 레이어(premium-rate)는 휴게 제외 이후의 세그먼트를 받는다고 가정하므로,
    // 09:00~20:00(휴게 미차감 11h) 원시 구간을 그대로 넣으면 연장은 3h(180분)다
    // (일일 근태 시나리오2/3의 "2h"는 휴게 60분 차감 이후 값 — daily-attendance.spec.ts에서 검증).
    const segments = attribute('09:00', '20:00', [{ calendarDate: D, isHoliday: false }]);
    const unapproved = computePremiumBreakdown({ segments, isUnderFiveEmployees: false, overtimeApproved: null, policy });
    const approved = computePremiumBreakdown({ segments, isUnderFiveEmployees: false, overtimeApproved: true, policy });

    const u = unapproved.find((e) => e.payBucket === 'OVERTIME')!;
    const a = approved.find((e) => e.payBucket === 'OVERTIME')!;
    expect(u.rateMultiplier).toBe(a.rateMultiplier);
    expect(u.approvalStatus).toBe('UNAPPROVED');
    expect(a.approvalStatus).toBe('APPROVED');
    expect(u.minutes).toBe(180);
  });
});
