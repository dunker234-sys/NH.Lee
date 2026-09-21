import { PolicyConfig } from '../types/policy-config';
import { DailyCalculationInput } from '../types/inputs';
import { calculateDailyAttendance } from './daily-attendance';

const policy: PolicyConfig = {
  dailyStatutoryLimitMinutes: 480,
  weeklyStatutoryLimitMinutes: 2400,
  weeklyOvertimeCapMinutes: 720,
  nightStartMinuteOfDay: 22 * 60,
  nightEndMinuteOfDay: 6 * 60,
  overtimePremiumRate: 0.5,
  nightPremiumRate: 0.5,
  holidayPremiumRateWithin8h: 0.5,
  holidayPremiumRateExcess8h: 1.0,
  breakTierThresholdMinutes: 240,
  breakTierMinutes: 30,
  breakFullTierThresholdMinutes: 480,
  breakFullTierMinutes: 60,
  ultraPartTimeWeeklyThresholdMinutes: 900,
  annualLeaveMinContinuousMonths: 12,
};

function kst(hhmm: string, day: string): string {
  const [year, month, dateNum] = day.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, dateNum, hour - 9, minute)).toISOString();
}

const D = '2026-08-24'; // 월요일이라고 가정

function baseInput(overrides: Partial<DailyCalculationInput> = {}): DailyCalculationInput {
  return {
    workDate: D,
    scheduledStartAt: kst('09:00', D),
    scheduledEndAt: kst('18:00', D),
    scheduledBreakSegments: [{ startAt: kst('12:00', D), endAt: kst('13:00', D) }],
    punches: [
      { type: 'IN', recordedAt: kst('09:00', D) },
      { type: 'OUT', recordedAt: kst('18:00', D) },
    ],
    breakNotGrantedReported: false,
    holidayStatusByCalendarDate: [{ calendarDate: D, isHoliday: false }],
    isUnderFiveEmployees: false,
    overtimeApproved: null,
    workNotProvidedJudgment: null,
    contractedDailyWorkMinutes: null,
    paidLeaveMinutes: 0,
    ...overrides,
  };
}

describe('시나리오1: 09:00~18:00, 계획 휴게 12:00~13:00 → 소정 8h, 연장 0', () => {
  it('actualWorkMinutes=480, overtime 전부 0', () => {
    const result = calculateDailyAttendance(baseInput(), policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.actualWorkMinutes).toBe(480);
    expect(result.approvedOvertimeMinutes).toBe(0);
    expect(result.unapprovedOvertimeMinutes).toBe(0);
    expect(result.scheduledWorkMinutes).toBe(480);
  });
});

describe('시나리오2/3: 09:00~20:00, 휴게 60분 → 소정 8h + 연장 2h (승인/미승인)', () => {
  const input = baseInput({
    scheduledEndAt: kst('18:00', D),
    punches: [
      { type: 'IN', recordedAt: kst('09:00', D) },
      { type: 'BREAK_OUT', recordedAt: kst('12:00', D) },
      { type: 'BREAK_IN', recordedAt: kst('13:00', D) },
      { type: 'OUT', recordedAt: kst('20:00', D) },
    ],
  });

  it('시나리오2: 승인 있음 → approvedOvertimeMinutes=120', () => {
    const result = calculateDailyAttendance({ ...input, overtimeApproved: true }, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.scheduledWorkMinutes).toBe(480);
    expect(result.approvedOvertimeMinutes).toBe(120);
    expect(result.unapprovedOvertimeMinutes).toBe(0);
    expect(result.actualWorkMinutes).toBe(600);
  });

  it('시나리오3: 승인 없음 → unapprovedOvertimeMinutes=120, UNAPPROVED_ACTUAL 플래그, 근로시간에는 포함', () => {
    const result = calculateDailyAttendance({ ...input, overtimeApproved: null }, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.approvedOvertimeMinutes).toBe(0);
    expect(result.unapprovedOvertimeMinutes).toBe(120);
    expect(result.actualWorkMinutes).toBe(600); // 0으로 계산되지 않는다 — 대원칙
    expect(result.reviewFlags).toContain('UNAPPROVED_ACTUAL');
  });
});

describe('시나리오4: 계획 시작 08:30인데 08:00 타각 → 조기출근 30분도 UNAPPROVED_ACTUAL로 산입', () => {
  it('조기출근 30분이 unapprovedOvertimeMinutes에 포함된다', () => {
    const input = baseInput({
      scheduledStartAt: kst('08:30', D),
      scheduledEndAt: kst('17:30', D),
      scheduledBreakSegments: [{ startAt: kst('12:00', D), endAt: kst('13:00', D) }],
      punches: [
        { type: 'IN', recordedAt: kst('08:00', D) },
        { type: 'BREAK_OUT', recordedAt: kst('12:00', D) },
        { type: 'BREAK_IN', recordedAt: kst('13:00', D) },
        { type: 'OUT', recordedAt: kst('17:30', D) },
      ],
      overtimeApproved: null,
    });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    // 체류 08:00~17:30(9.5h) - 휴게60분 = 510분 실근로. 소정8h(480)+연장30분.
    expect(result.unapprovedOvertimeMinutes).toBe(30);
    expect(result.actualWorkMinutes).toBe(510);
  });
});

describe('시나리오5: 관리자가 미승인 실적을 "근로 미제공"으로 판정 → 그때 비로소 제외', () => {
  const scenario3Input = baseInput({
    punches: [
      { type: 'IN', recordedAt: kst('09:00', D) },
      { type: 'BREAK_OUT', recordedAt: kst('12:00', D) },
      { type: 'BREAK_IN', recordedAt: kst('13:00', D) },
      { type: 'OUT', recordedAt: kst('20:00', D) },
    ],
    overtimeApproved: null,
  });

  it('판정 전(시나리오3)에는 그대로 산입된다', () => {
    const result = calculateDailyAttendance(scenario3Input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.unapprovedOvertimeMinutes).toBe(120);
  });

  it('judged=true로 판정되면 그 시간만 제외되고 근거는 breakdown에 남는다', () => {
    const judgedInput = {
      ...scenario3Input,
      workNotProvidedJudgment: { judged: true, reason: '근로 미제공 확인', judgedBy: 'HQ_HR-001' },
    };
    const result = calculateDailyAttendance(judgedInput, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.unapprovedOvertimeMinutes).toBe(0);
    expect(result.actualWorkMinutes).toBe(480); // 연장분 제외, 소정만 남음
    const excludedEntry = result.breakdown.find((e) => e.payBucket === 'OVERTIME');
    expect(excludedEntry?.note).toContain('근로 미제공');
  });
});

describe('시나리오11/13/37: 교대·야간·근로일 귀속', () => {
  it('시나리오11: 22:00~익일06:00, work_date는 시업일, 야간근로 8h', () => {
    const nextDay = '2026-08-25';
    const input = baseInput({
      workDate: D, // 시업일 — 호출자가 이미 이렇게 산출해 넘긴다
      scheduledStartAt: null,
      scheduledEndAt: null,
      scheduledBreakSegments: [],
      // 이 테스트는 휴게가 아니라 야간/시업일 귀속만 검증한다 — 휴게 미부여로
      // 명시해 break-resolution의 §54 역산(시나리오10)과 얽히지 않게 한다.
      breakNotGrantedReported: true,
      punches: [
        { type: 'IN', recordedAt: kst('22:00', D) },
        { type: 'OUT', recordedAt: kst('06:00', nextDay) },
      ],
      holidayStatusByCalendarDate: [
        { calendarDate: D, isHoliday: false },
        { calendarDate: nextDay, isHoliday: false },
      ],
    });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.workDate).toBe(D); // 엔진이 재계산하지 않고 입력값을 그대로 유지
    expect(result.nightWorkMinutes).toBe(480); // 8h 전부 야간(22:00~06:00)
    expect(result.actualWorkMinutes).toBe(480);
  });

  it('시나리오13: 조식조 05:00~14:00, work_date는 당일 유지, 05:00~06:00만 야간', () => {
    const input = baseInput({
      scheduledStartAt: kst('05:00', D),
      scheduledEndAt: kst('14:00', D),
      scheduledBreakSegments: [{ startAt: kst('09:00', D), endAt: kst('10:00', D) }],
      punches: [
        { type: 'IN', recordedAt: kst('05:00', D) },
        { type: 'BREAK_OUT', recordedAt: kst('09:00', D) },
        { type: 'BREAK_IN', recordedAt: kst('10:00', D) },
        { type: 'OUT', recordedAt: kst('14:00', D) },
      ],
    });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.workDate).toBe(D); // 전날로 귀속되지 않는다
    expect(result.nightWorkMinutes).toBe(60); // 05:00~06:00
  });
});

describe('시나리오12: 금 22:00~토 06:00, 역일 분할 — work_date/52h는 시업일(금) 귀속, 휴일가산은 역일별', () => {
  const fri = '2026-08-21';
  const sat = '2026-08-22';

  it('토요일이 약정휴일이 아니면 전 구간이 평일 야간근로로만 처리된다', () => {
    const input = baseInput({
      workDate: fri,
      scheduledStartAt: null,
      scheduledEndAt: null,
      scheduledBreakSegments: [],
      breakNotGrantedReported: true, // 이 테스트는 역일분할만 검증한다(휴게 산식과 분리)
      punches: [
        { type: 'IN', recordedAt: kst('22:00', fri) },
        { type: 'OUT', recordedAt: kst('06:00', sat) },
      ],
      holidayStatusByCalendarDate: [
        { calendarDate: fri, isHoliday: false },
        { calendarDate: sat, isHoliday: false },
      ],
    });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.workDate).toBe(fri); // 시업일 귀속
    expect(result.nightWorkMinutes).toBe(480); // 8h 전부 야간
    expect(result.holidayWorkMinutesNormal).toBe(0);
    expect(result.holidayWorkMinutesExcess).toBe(0);
  });

  it('토요일이 약정휴일이면 토요일에 걸리는 6h만 휴일근로로 집계되고(금 2h는 제외), work_date는 그대로 금요일이다', () => {
    const input = baseInput({
      workDate: fri,
      scheduledStartAt: null,
      scheduledEndAt: null,
      scheduledBreakSegments: [],
      breakNotGrantedReported: true,
      punches: [
        { type: 'IN', recordedAt: kst('22:00', fri) },
        { type: 'OUT', recordedAt: kst('06:00', sat) },
      ],
      holidayStatusByCalendarDate: [
        { calendarDate: fri, isHoliday: false },
        { calendarDate: sat, isHoliday: true },
      ],
    });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.workDate).toBe(fri); // 휴일 여부와 무관하게 시업일 귀속은 그대로
    expect(result.actualWorkMinutes).toBe(480); // 8h 전부 근로시간으로 집계(52h 판정 기준)
    expect(result.holidayWorkMinutesNormal).toBe(360); // 토요일 00:00~06:00 = 6h만 휴일
    expect(result.holidayWorkMinutesExcess).toBe(0);
    expect(result.nightWorkMinutes).toBe(480); // 야간 판정은 역일과 무관하게 전 구간 유지
  });
});

describe('시나리오25: 3월(4명, 5인미만)분을 6월(7명)에 재계산해도 3월 기준이 유지된다', () => {
  it('isUnderFiveEmployees는 순수 입력값이라 "현재" 상태를 조회하지 않는다 — 같은 근무를 다른 시점 상태로 재호출해도 그 입력값에만 좌우된다', () => {
    const marchWorkInput = baseInput({
      workDate: '2026-03-10',
      scheduledStartAt: kst('09:00', '2026-03-10'),
      scheduledEndAt: kst('18:00', '2026-03-10'),
      scheduledBreakSegments: [{ startAt: kst('12:00', '2026-03-10'), endAt: kst('13:00', '2026-03-10') }],
      punches: [
        { type: 'IN', recordedAt: kst('09:00', '2026-03-10') },
        { type: 'BREAK_OUT', recordedAt: kst('12:00', '2026-03-10') },
        { type: 'BREAK_IN', recordedAt: kst('13:00', '2026-03-10') },
        { type: 'OUT', recordedAt: kst('20:00', '2026-03-10') },
      ],
      holidayStatusByCalendarDate: [{ calendarDate: '2026-03-10', isHoliday: false }],
      overtimeApproved: true,
    });

    // "3월 재계산"(3월 당시 5인 미만) — 호출자가 3월 시점 이력값을 주입
    const recalculatedInMarchContext = calculateDailyAttendance({ ...marchWorkInput, isUnderFiveEmployees: true }, policy);
    // "6월에 다시 재계산"해도 호출자가 여전히 3월 시점 이력값(5인미만)을 주입하면 결과는 동일해야 한다
    const recalculatedInJuneContext = calculateDailyAttendance({ ...marchWorkInput, isUnderFiveEmployees: true }, policy);

    if (recalculatedInMarchContext.status !== 'CALCULATED' || recalculatedInJuneContext.status !== 'CALCULATED') {
      throw new Error('CALCULATED expected');
    }
    expect(recalculatedInJuneContext).toEqual(recalculatedInMarchContext);

    // 대조군: 만약 호출자가 실수로 "현재(6월)" 상태(5인 이상)를 넣으면 결과가 달라진다는 것도
    // 함께 보여준다 — 즉 엔진은 순수하게 입력값만 따르고, 올바른 값을 주입하는 책임은 호출자(STEP 3.5)에 있다.
    const wronglyUsingCurrentState = calculateDailyAttendance({ ...marchWorkInput, isUnderFiveEmployees: false }, policy);
    if (wronglyUsingCurrentState.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(wronglyUsingCurrentState.approvedOvertimeMinutes).toBe(recalculatedInMarchContext.approvedOvertimeMinutes); // 시간 분류는 동일
    const marchOvertimeEntry = recalculatedInMarchContext.breakdown.find((e) => e.payBucket === 'OVERTIME');
    const wrongOvertimeEntry = wronglyUsingCurrentState.breakdown.find((e) => e.payBucket === 'OVERTIME');
    expect(marchOvertimeEntry?.rateMultiplier).toBe(1.0); // 5인미만 — 가산 없음
    expect(wrongOvertimeEntry?.rateMultiplier).toBe(1.5); // 5인이상으로 잘못 넣으면 가산이 생김(대조 확인용)
  });
});

describe('시나리오17: 법정 공휴일 근로 → 휴일근로 가산 대상', () => {
  it('holidayStatusByCalendarDate에서 휴일로 판정되면 holidayWorkMinutesNormal에 반영된다', () => {
    const input = baseInput({ holidayStatusByCalendarDate: [{ calendarDate: D, isHoliday: true }] });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.holidayWorkMinutesNormal).toBe(480);
    expect(result.holidayWorkMinutesExcess).toBe(0);
  });
});

describe('시나리오33: 소정 6시간 근로자가 8시간 근로 → 가산 없이 소정초과분만 별도 필드', () => {
  it('scheduledExcessMinutes=120, 연장 가산 없음', () => {
    const input = baseInput({ contractedDailyWorkMinutes: 360 });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.scheduledExcessMinutes).toBe(120);
    expect(result.approvedOvertimeMinutes).toBe(0);
    expect(result.unapprovedOvertimeMinutes).toBe(0);
  });
});

describe('시나리오35: 반차(오전) + 오후 근무 → 4h 근로 + 4h 유급 (leave-application 연동)', () => {
  it('오후만 출근하고 오전 반차의 paidLeaveMinutes를 함께 넘기면 actualWorkMinutes=240, paidLeaveMinutes=240', () => {
    // 13:00~17:30 체류(270분) — §54상 4시간 근로에도 30분 휴게가 필요해(정확히 4h
    // 체류로는 순환모순이 된다, 시나리오10 데드존 참고) 휴게 30분을 자연히 포함시켜
    // 정확히 4h(240분) 실근로가 나오게 한다.
    const input = baseInput({
      scheduledStartAt: kst('13:00', D),
      scheduledEndAt: kst('17:30', D),
      scheduledBreakSegments: [],
      punches: [
        { type: 'IN', recordedAt: kst('13:00', D) },
        { type: 'OUT', recordedAt: kst('17:30', D) },
      ],
      paidLeaveMinutes: 240, // applyLeave({unit:'HALF_AM', contractedDailyWorkMinutes:480, status:'APPROVED'}).paidLeaveMinutes
    });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.actualWorkMinutes).toBe(240);
    expect(result.paidLeaveMinutes).toBe(240);
  });
});

describe('시나리오36: 결근/지각/조퇴', () => {
  it('지각(10분)과 조퇴(20분)가 각각 산출된다', () => {
    const input = baseInput({
      punches: [
        { type: 'IN', recordedAt: kst('09:10', D) },
        { type: 'BREAK_OUT', recordedAt: kst('12:00', D) },
        { type: 'BREAK_IN', recordedAt: kst('13:00', D) },
        { type: 'OUT', recordedAt: kst('17:40', D) },
      ],
    });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.latenessMinutes).toBe(10);
    expect(result.earlyLeaveMinutes).toBe(20);
  });

  it('타각이 전혀 없으면 결근으로 처리된다(isAbsence=true), 임의 근로시간을 만들지 않는다', () => {
    const input = baseInput({ punches: [] });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.isAbsence).toBe(true);
    expect(result.actualWorkMinutes).toBe(0);
  });
});

describe('시나리오37: 시각 UTC 저장, work_date는 KST — 조식조 05:00 타각이 전날로 귀속되지 않는다', () => {
  it('05:00 KST(=전날 20:00 UTC) 타각도 workDate가 그대로 유지된다', () => {
    const input = baseInput({
      scheduledStartAt: kst('05:00', D),
      scheduledEndAt: kst('14:00', D),
      scheduledBreakSegments: [],
      punches: [
        { type: 'IN', recordedAt: kst('05:00', D) },
        { type: 'OUT', recordedAt: kst('14:00', D) },
      ],
    });
    expect(input.punches[0].recordedAt).toBe('2026-08-23T20:00:00.000Z'); // UTC로는 전날
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.workDate).toBe(D); // 그래도 workDate는 당일
  });
});

describe('엣지: IN 타각 없이 계산 시도', () => {
  it('OUT만 있고 IN이 없으면 MissingClockInError를 던진다', () => {
    const input = baseInput({ punches: [{ type: 'OUT', recordedAt: kst('18:00', D) }] });
    expect(() => calculateDailyAttendance(input, policy)).toThrow('IN(출근) 타각이 없어');
  });
});

describe('엣지: holidayStatusByCalendarDate에 실제로 걸리는 역일 정보가 없으면 오류', () => {
  it('InvalidCalculationInputError를 던진다', () => {
    const input = baseInput({ holidayStatusByCalendarDate: [] });
    expect(() => calculateDailyAttendance(input, policy)).toThrow('holidayStatusByCalendarDate');
  });
});

describe('시나리오38: 퇴근 타각 누락 → PENDING, 임의 값 채우지 않음', () => {
  it('OUT이 없으면 PENDING을 반환한다', () => {
    const input = baseInput({ punches: [{ type: 'IN', recordedAt: kst('09:00', D) }] });
    const result = calculateDailyAttendance(input, policy);
    expect(result.status).toBe('PENDING');
    if (result.status === 'PENDING') {
      expect(result.reason).toBe('CLOCK_OUT_MISSING');
    }
  });
});

describe('시나리오39: 동일 시각 중복 타각 → 멱등 처리', () => {
  it('완전히 동일한(type,recordedAt) IN 타각이 중복 제출돼도 결과가 같다', () => {
    const input = baseInput({
      punches: [
        { type: 'IN', recordedAt: kst('09:00', D) },
        { type: 'IN', recordedAt: kst('09:00', D) }, // 중복
        { type: 'OUT', recordedAt: kst('18:00', D) },
      ],
    });
    const result = calculateDailyAttendance(input, policy);
    if (result.status !== 'CALCULATED') throw new Error('CALCULATED expected');
    expect(result.actualWorkMinutes).toBe(480);
  });
});
