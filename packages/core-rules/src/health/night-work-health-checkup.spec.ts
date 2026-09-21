import { determineNightWorkHealthCheckupEligibility, NightWorkHealthCheckupPolicy, sumOverlapMinutesWithDailyBand } from './night-work-health-checkup';

function kst(hhmm: string, day: string): string {
  const [year, month, dateNum] = day.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, dateNum, hour - 9, minute)).toISOString();
}

/** 2026-01-01부터 n일 뒤의 "YYYY-MM-DD" — 월/일 오버플로를 손으로 계산하지 않는다. */
function dayAfterEpoch(n: number): string {
  const d = new Date(Date.UTC(2026, 0, 1));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 22:00(day n)~06:00(day n+1) 야간 세션. */
function nightSession(n: number) {
  return { startAt: kst('22:00', dayAfterEpoch(n)), endAt: kst('06:00', dayAfterEpoch(n + 1)) };
}

// 시행규칙 별표22 제4호. ①은 00:00~05:00 포함 연속 8h, ②는 22:00~06:00.
const policy: NightWorkHealthCheckupPolicy = {
  criterion1MinConsecutiveMinutes: 480,
  criterion1MonthlyAvgThreshold: 4,
  criterion2MonthlyAvgMinutesThreshold: 3600, // 60h
  monthsInWindow: 6,
  criterion1BandStartMinuteOfDay: 0,
  criterion1BandEndMinuteOfDay: 300,
  criterion2BandStartMinuteOfDay: 1320,
  criterion2BandEndMinuteOfDay: 360,
};

describe('sumOverlapMinutesWithDailyBand — 역일 걸침 밴드 겹침 계산', () => {
  it('밴드가 자정을 걸치지 않는 경우(00:00~05:00) 그대로 겹침 계산', () => {
    const minutes = sumOverlapMinutesWithDailyBand({ startAt: kst('02:00', '2026-01-05'), endAt: kst('04:00', '2026-01-05') }, 0, 300);
    expect(minutes).toBe(120);
  });

  it('밴드가 자정을 걸치는 경우(22:00~06:00), 세션도 자정을 걸치면 전부 겹친다', () => {
    const minutes = sumOverlapMinutesWithDailyBand(
      { startAt: kst('22:00', '2026-01-05'), endAt: kst('06:00', '2026-01-06') },
      1320,
      360,
    );
    expect(minutes).toBe(480);
  });

  it('세션 일부만 22:00~06:00 밴드와 겹치는 경우(20:00~05:00 중 22:00~05:00만 겹침=7h)', () => {
    const minutes = sumOverlapMinutesWithDailyBand(
      { startAt: kst('20:00', '2026-01-05'), endAt: kst('05:00', '2026-01-06') },
      1320,
      360,
    );
    expect(minutes).toBe(420);
  });

  it('밴드와 전혀 겹치지 않는 주간 근무(09:00~18:00)는 0', () => {
    const minutes = sumOverlapMinutesWithDailyBand({ startAt: kst('09:00', '2026-01-05'), endAt: kst('18:00', '2026-01-05') }, 1320, 360);
    expect(minutes).toBe(0);
  });
});

describe('determineNightWorkHealthCheckupEligibility — 산안법 §130, 시행규칙 별표22 제4호', () => {
  it('①: 00:00~05:00을 포함하는 연속 8h 작업이 6개월간 24회(월평균 4회) 이상이면 해당', () => {
    // 이틀 간격으로 24회 배치 — 6개월(약 180일) 창 안에 넉넉히 들어간다.
    const sessions = Array.from({ length: 24 }, (_, i) => nightSession(i * 2));
    const result = determineNightWorkHealthCheckupEligibility({ sessions, policy });
    expect(result.criterion1Count).toBe(24);
    expect(result.criterion1RequiredCount).toBe(24);
    expect(result.criterion1Met).toBe(true);
    expect(result.eligible).toBe(true);
  });

  it('①에 1회 못 미치면(23회) 미달', () => {
    const sessions = Array.from({ length: 23 }, (_, i) => nightSession(i * 2));
    const result = determineNightWorkHealthCheckupEligibility({ sessions, policy });
    expect(result.criterion1Met).toBe(false);
  });

  it('★ 00:00~05:00 창을 포함하지 않는 주간 근무는 8h 연속이어도 ①에 산입하지 않는다', () => {
    const sessions = Array.from({ length: 30 }, (_, i) => ({
      startAt: kst('09:00', dayAfterEpoch(i)),
      endAt: kst('17:00', dayAfterEpoch(i)),
    }));
    const result = determineNightWorkHealthCheckupEligibility({ sessions, policy });
    expect(result.criterion1Count).toBe(0);
    expect(result.criterion1Met).toBe(false);
  });

  it('★ 00:00~05:00에 걸치더라도 연속 8h 미만이면 ①에 산입하지 않는다', () => {
    const sessions = [{ startAt: kst('01:00', '2026-01-05'), endAt: kst('05:00', '2026-01-05') }]; // 4h
    const result = determineNightWorkHealthCheckupEligibility({ sessions, policy });
    expect(result.criterion1Count).toBe(0);
  });

  it('②: 22:00~06:00 근로가 6개월간 21600분(월평균 60h) 이상이면 해당 — ①과 별도로 단독 성립', () => {
    // 8h(480분)짜리 22:00~06:00 세션 45개 = 21600분 = 정확히 6개월×60h. ①의 24회에는 못 미치는 간격으로 배치.
    const sessions = Array.from({ length: 45 }, (_, i) => nightSession(i * 4));
    const result = determineNightWorkHealthCheckupEligibility({ sessions, policy });
    expect(result.criterion2TotalMinutes).toBe(21600);
    expect(result.criterion2RequiredMinutes).toBe(21600);
    expect(result.criterion2Met).toBe(true);
    expect(result.criterion1Met).toBe(true); // 45회는 24회 요건도 넘긴다 — 두 기준 동시 충족 케이스
    expect(result.eligible).toBe(true);
  });

  it('②만 단독으로 충족하고 ①은 미달인 경우(세션 수는 24회 미만이지만 시간 총합은 충분)', () => {
    // 세션당 12h(720분)씩 20회 = 14400분(240h) → 월평균 40h로는 부족하니, 임계를 낮춘 정책으로 검증한다.
    const lenientPolicy: NightWorkHealthCheckupPolicy = { ...policy, criterion2MonthlyAvgMinutesThreshold: 1200 }; // 월 20h
    const sessions = Array.from({ length: 20 }, (_, i) => nightSession(i * 5)); // 480분짜리 20회 = 9600분
    const result = determineNightWorkHealthCheckupEligibility({ sessions, policy: lenientPolicy });
    expect(result.criterion1Met).toBe(false); // 20회 < 24회
    expect(result.criterion2Met).toBe(true); // 9600분 >= 1200*6=7200분
    expect(result.eligible).toBe(true);
  });

  it('두 기준 모두 미달이면 대상이 아니다', () => {
    const result = determineNightWorkHealthCheckupEligibility({
      sessions: [{ startAt: kst('09:00', '2026-01-05'), endAt: kst('18:00', '2026-01-05') }],
      policy,
    });
    expect(result.criterion1Met).toBe(false);
    expect(result.criterion2Met).toBe(false);
    expect(result.eligible).toBe(false);
  });
});
