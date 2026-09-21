import { LeavePromotionPolicyConfig } from '../../types/policy-config';
import { computeArticle612Schedule, determineArticle612Compliance } from './article-61-2-schedule';

const policy: LeavePromotionPolicyConfig = {
  article611FirstNoticeWindowDays: 10,
  article611FirstNoticeAnchorMonthsBeforeExpiry: 6,
  article611EmployeeResponseWindowDays: 10,
  article611SecondNoticeDeadlineMonthsBeforeExpiry: 2,
  article612WaveAFirstNoticeWindowDays: 10,
  article612WaveAFirstNoticeAnchorMonthsBefore: 3,
  article612WaveASecondNoticeDeadlineMonthsBefore: 1,
  article612WaveBFirstNoticeWindowDays: 5,
  article612WaveBFirstNoticeAnchorMonthsBefore: 1,
  article612WaveBSecondNoticeDeadlineDaysBefore: 10,
};

describe('computeArticle612Schedule — §61② WAVE_A/WAVE_B 기한 계산', () => {
  it('WAVE_A는 종료 3개월 전 10일 창 + 1개월 전 통보기한, WAVE_B는 1개월 전 5일 창 + 10일 전 통보기한', () => {
    const schedule = computeArticle612Schedule({ firstYearEndDate: '2026-12-31' }, policy);
    expect(schedule.waveA.firstNoticeWindowStart).toBe('2026-09-30');
    expect(schedule.waveA.firstNoticeWindowEnd).toBe('2026-10-09');
    expect(schedule.waveA.secondNoticeDeadline).toBe('2026-11-30');

    expect(schedule.waveB.firstNoticeWindowStart).toBe('2026-11-30');
    expect(schedule.waveB.firstNoticeWindowEnd).toBe('2026-12-04');
    expect(schedule.waveB.secondNoticeDeadline).toBe('2026-12-21');
  });
});

describe('determineArticle612Compliance', () => {
  const firstYearEndDate = '2026-12-31';

  it('두 웨이브 모두 절차를 준수하면 전체적으로 의무가 없다', () => {
    const result = determineArticle612Compliance(
      {
        firstYearEndDate,
        waveA: { firstNotice: { sentAt: '2026-10-01', method: 'WRITTEN_PAPER' }, secondNotice: { sentAt: '2026-11-20', method: 'WRITTEN_PAPER' } },
        waveB: { firstNotice: { sentAt: '2026-12-01', method: 'WRITTEN_PAPER' }, secondNotice: { sentAt: '2026-12-15', method: 'WRITTEN_PAPER' } },
      },
      policy,
    );
    expect(result.waveA.compensationObligationExists).toBe(false);
    expect(result.waveB.compensationObligationExists).toBe(false);
    expect(result.overallCompensationObligationExists).toBe(false);
  });

  it('1차 통지는 유효하지만 2차 통지가 없으면 그 웨이브는 의무가 있다', () => {
    const result = determineArticle612Compliance(
      {
        firstYearEndDate,
        waveA: { firstNotice: { sentAt: '2026-10-01', method: 'WRITTEN_PAPER' }, secondNotice: null },
        waveB: { firstNotice: { sentAt: '2026-12-01', method: 'WRITTEN_PAPER' }, secondNotice: { sentAt: '2026-12-15', method: 'WRITTEN_PAPER' } },
      },
      policy,
    );
    expect(result.waveA.compensationObligationExists).toBe(true);
    expect(result.waveA.failedRequirements).toContain('SECOND_NOTICE_MISSING_OR_LATE');
  });

  it('WAVE_A만 위반해도 전체 의무가 있다고 판정된다', () => {
    const result = determineArticle612Compliance(
      {
        firstYearEndDate,
        waveA: { firstNotice: null, secondNotice: null },
        waveB: { firstNotice: { sentAt: '2026-12-01', method: 'WRITTEN_PAPER' }, secondNotice: { sentAt: '2026-12-15', method: 'WRITTEN_PAPER' } },
      },
      policy,
    );
    expect(result.waveA.compensationObligationExists).toBe(true);
    expect(result.waveB.compensationObligationExists).toBe(false);
    expect(result.overallCompensationObligationExists).toBe(true);
  });
});
