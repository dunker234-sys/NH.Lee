import { CircularBreakContradictionError } from '../types/errors';
import { PolicyConfig } from '../types/policy-config';
import { resolveBreak } from './break-resolution';

const policy: Pick<
  PolicyConfig,
  'breakTierThresholdMinutes' | 'breakTierMinutes' | 'breakFullTierThresholdMinutes' | 'breakFullTierMinutes' | 'dailyStatutoryLimitMinutes'
> = {
  breakTierThresholdMinutes: 240,
  breakTierMinutes: 30,
  breakFullTierThresholdMinutes: 480,
  breakFullTierMinutes: 60,
  dailyStatutoryLimitMinutes: 480,
};

const D = '2026-08-24';
const t = (hhmm: string) => `${D}T${hhmm}:00.000Z`; // 테스트 편의상 UTC=로컬로 취급(KST 변환은 다른 모듈 책임)

describe('resolveBreak', () => {
  it('시나리오6: 09:00~18:00, 휴게 타각 없음 → 스케줄 기준 60분 공제(실근로 8h)', () => {
    const result = resolveBreak({
      stayStartAt: t('09:00'),
      stayEndAt: t('18:00'),
      punches: [],
      scheduledBreakSegments: [{ startAt: t('12:00'), endAt: t('13:00') }],
      breakNotGrantedReported: false,
      policy,
    });
    expect(result.breakMinutes).toBe(60);
    expect(result.reviewFlags).not.toContain('BREAK_NOT_GRANTED');
  });

  it('시나리오7: 동일 조건, "휴게 미부여" 신고 → 공제 0(실근로 9h) + 검토플래그', () => {
    const result = resolveBreak({
      stayStartAt: t('09:00'),
      stayEndAt: t('18:00'),
      punches: [],
      scheduledBreakSegments: [{ startAt: t('12:00'), endAt: t('13:00') }],
      breakNotGrantedReported: true,
      policy,
    });
    expect(result.breakMinutes).toBe(0);
    expect(result.reviewFlags).toContain('BREAK_NOT_GRANTED');
  });

  it('시나리오8: 외출/복귀 타각(12:00/13:00)이 있으면 타각 기준 60분만 공제 — 스케줄 자동공제를 더하지 않는다', () => {
    const result = resolveBreak({
      stayStartAt: t('09:00'),
      stayEndAt: t('18:00'),
      punches: [
        { type: 'BREAK_OUT', recordedAt: t('12:00') },
        { type: 'BREAK_IN', recordedAt: t('13:00') },
      ],
      // 스케줄에도 동일 구간이 있지만, 타각이 있으므로 완전히 무시되어야 한다.
      scheduledBreakSegments: [{ startAt: t('12:00'), endAt: t('13:00') }],
      breakNotGrantedReported: false,
      policy,
    });
    expect(result.breakMinutes).toBe(60); // 120이면 오답(스케줄 이중 공제)
  });

  it('시나리오9: 09:00~22:00(연장4h) 실제 휴게가 60분만 제공됨 → 90분(60+30) 미달 경고, 강제 추가 공제는 없음', () => {
    const result = resolveBreak({
      stayStartAt: t('09:00'),
      stayEndAt: t('22:00'),
      punches: [
        { type: 'BREAK_OUT', recordedAt: t('12:00') },
        { type: 'BREAK_IN', recordedAt: t('13:00') },
      ],
      scheduledBreakSegments: [{ startAt: t('12:00'), endAt: t('13:00') }],
      breakNotGrantedReported: false,
      policy,
    });
    expect(result.breakMinutes).toBe(60); // 강제로 90분 빼지 않는다
    expect(result.warnings.some((w) => w.includes('2020도15393'))).toBe(true);
  });

  it('시나리오10: 순환모순 구간(예: 체류 520분)에서는 명시적 에러를 던진다', () => {
    expect(() =>
      resolveBreak({
        stayStartAt: t('09:00'),
        stayEndAt: '2026-08-24T17:40:00.000Z', // 09:00~17:40 = 520분
        punches: [],
        scheduledBreakSegments: [],
        breakNotGrantedReported: false,
        policy,
      }),
    ).toThrow(CircularBreakContradictionError);
  });

  describe('시나리오10 경계값 (데드존 자체 보강 테스트)', () => {
    const cases: [minutes: number, expected: number | 'THROW'][] = [
      [239, 0],
      [240, 'THROW'],
      [269, 'THROW'],
      [270, 30],
      [509, 30],
      [510, 'THROW'],
      [539, 'THROW'],
      [540, 60],
    ];

    it.each(cases)('체류 %i분 → %s', (minutes, expected) => {
      const stayEndAt = new Date(Date.parse(t('00:00')) + minutes * 60000).toISOString();
      const run = () =>
        resolveBreak({
          stayStartAt: t('00:00'),
          stayEndAt,
          punches: [],
          scheduledBreakSegments: [],
          breakNotGrantedReported: false,
          policy,
        });

      if (expected === 'THROW') {
        expect(run).toThrow(CircularBreakContradictionError);
      } else {
        expect(run().breakMinutes).toBe(expected);
      }
    });
  });

  it('연속된 BREAK_OUT(짝 없는 이전 OUT) — 이전 OUT도 짝 없이 마감되어 공제하지 않는다', () => {
    const result = resolveBreak({
      stayStartAt: t('09:00'),
      stayEndAt: t('18:00'),
      punches: [
        { type: 'BREAK_OUT', recordedAt: t('11:00') },
        { type: 'BREAK_OUT', recordedAt: t('12:00') }, // 짝 없이 또 OUT — 11:00 건은 미매칭 처리
        { type: 'BREAK_IN', recordedAt: t('13:00') },
      ],
      scheduledBreakSegments: [],
      breakNotGrantedReported: false,
      policy,
    });
    expect(result.breakMinutes).toBe(60); // 12:00~13:00만 유효한 짝
    expect(result.reviewFlags).toContain('BREAK_IN_MISSING');
  });

  it('41번째(자체 발견): BREAK_OUT은 있는데 BREAK_IN 없이 OUT — 실근로를 휴게로 둔갑시키지 않는다(공제 0)', () => {
    const result = resolveBreak({
      stayStartAt: t('09:00'),
      stayEndAt: t('18:00'),
      punches: [{ type: 'BREAK_OUT', recordedAt: t('12:00') }],
      scheduledBreakSegments: [{ startAt: t('12:00'), endAt: t('13:00') }],
      breakNotGrantedReported: false,
      policy,
    });
    expect(result.breakMinutes).toBe(0);
    expect(result.reviewFlags).toContain('BREAK_IN_MISSING');
  });
});
