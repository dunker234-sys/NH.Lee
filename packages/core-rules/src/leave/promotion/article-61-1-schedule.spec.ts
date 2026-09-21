import { LeavePromotionPolicyConfig } from '../../types/policy-config';
import { computeArticle611Schedule, determineArticle611Compliance } from './article-61-1-schedule';

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

describe('computeArticle611Schedule — §61① 기한 계산', () => {
  it('소멸 6개월 전부터 10일 창, 소멸 2개월 전이 2차 통보 기한이다', () => {
    const schedule = computeArticle611Schedule({ leaveExpiryDate: '2027-01-31' }, policy);
    expect(schedule.firstNoticeWindowStart).toBe('2026-07-31');
    expect(schedule.firstNoticeWindowEnd).toBe('2026-08-09'); // 6개월전 + 9일(10일간)
    expect(schedule.secondNoticeDeadline).toBe('2026-11-30');
  });
});

describe('determineArticle611Compliance — 요구사항서4.3 §5 ★ 완료조건4 직접 증명', () => {
  const leaveExpiryDate = '2027-01-31';

  it('★ 1단계(1차 촉구) 자체가 누락되면 보상의무가 있다고 판정된다', () => {
    const result = determineArticle611Compliance(
      { leaveExpiryDate, firstNotice: null, employeeResponse: null, secondNotice: null },
      policy,
    );
    expect(result.compensationObligationExists).toBe(true);
    expect(result.failedRequirements).toContain('FIRST_NOTICE_MISSING_OR_LATE');
  });

  it('1차 촉구가 창 기간 밖(너무 늦게)이면 보상의무가 있다', () => {
    const result = determineArticle611Compliance(
      {
        leaveExpiryDate,
        firstNotice: { sentAt: '2026-09-01', method: 'WRITTEN_PAPER' }, // 창(2026-07-31~2026-08-09) 밖
        employeeResponse: null,
        secondNotice: null,
      },
      policy,
    );
    expect(result.compensationObligationExists).toBe(true);
    expect(result.failedRequirements).toContain('FIRST_NOTICE_MISSING_OR_LATE');
  });

  it('근로자가 기간 내 시기를 특정해 응답하면 2차 통지 없이도 의무가 없다', () => {
    const result = determineArticle611Compliance(
      {
        leaveExpiryDate,
        firstNotice: { sentAt: '2026-08-01', method: 'ELECTRONIC_DOCUMENT' },
        employeeResponse: { receivedAt: '2026-08-05', specifiedUsageDates: true },
        secondNotice: null,
      },
      policy,
    );
    expect(result.compensationObligationExists).toBe(false);
    expect(result.failedRequirements).toEqual([]);
  });

  it('근로자 미응답 + 2차 통지가 기한 내 있으면 의무가 없다', () => {
    const result = determineArticle611Compliance(
      {
        leaveExpiryDate,
        firstNotice: { sentAt: '2026-08-01', method: 'WRITTEN_PAPER' },
        employeeResponse: null,
        secondNotice: { sentAt: '2026-11-20', method: 'WRITTEN_PAPER' },
      },
      policy,
    );
    expect(result.compensationObligationExists).toBe(false);
  });

  it('★ 근로자 미응답인데 2차 통지도 없으면(2단계 누락) 보상의무가 있다', () => {
    const result = determineArticle611Compliance(
      {
        leaveExpiryDate,
        firstNotice: { sentAt: '2026-08-01', method: 'WRITTEN_PAPER' },
        employeeResponse: null,
        secondNotice: null,
      },
      policy,
    );
    expect(result.compensationObligationExists).toBe(true);
    expect(result.failedRequirements).toContain('SECOND_NOTICE_MISSING_OR_LATE');
  });

  it('2차 통지가 기한(소멸 2개월 전)보다 늦으면 의무가 있다', () => {
    const result = determineArticle611Compliance(
      {
        leaveExpiryDate,
        firstNotice: { sentAt: '2026-08-01', method: 'WRITTEN_PAPER' },
        employeeResponse: null,
        secondNotice: { sentAt: '2026-12-15', method: 'WRITTEN_PAPER' }, // 기한(2026-11-30) 이후
      },
      policy,
    );
    expect(result.compensationObligationExists).toBe(true);
    expect(result.failedRequirements).toContain('SECOND_NOTICE_MISSING_OR_LATE');
  });
});
