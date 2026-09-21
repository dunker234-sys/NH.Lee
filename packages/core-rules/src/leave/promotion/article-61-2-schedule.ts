import { LeavePromotionPolicyConfig } from '../../types/policy-config';
import { Article611Schedule, NoticeMethod } from './article-61-1-schedule';
import { addDays, subtractMonths } from './date-arithmetic';

export interface Article612Schedule {
  waveA: Article611Schedule;
  waveB: Article611Schedule;
}

/**
 * §61② — 계속근로 1년 미만자. 최초 발생분(WAVE_A: 종료 3개월 전 기준
 * 10일 창, 종료 1개월 전 통보기한)과 촉구 이후 추가 발생분(WAVE_B: 종료
 * 1개월 전 기준 5일 창, 종료 10일 전 통보기한)은 서로 다른 법정 기한을
 * 가진 독립 절차라 각각 계산한다.
 */
export function computeArticle612Schedule(
  input: { firstYearEndDate: string },
  policy: LeavePromotionPolicyConfig,
): Article612Schedule {
  const waveAAnchor = subtractMonths(input.firstYearEndDate, policy.article612WaveAFirstNoticeAnchorMonthsBefore);
  const waveBAnchor = subtractMonths(input.firstYearEndDate, policy.article612WaveBFirstNoticeAnchorMonthsBefore);

  return {
    waveA: {
      firstNoticeWindowStart: waveAAnchor,
      firstNoticeWindowEnd: addDays(waveAAnchor, policy.article612WaveAFirstNoticeWindowDays - 1),
      secondNoticeDeadline: subtractMonths(
        input.firstYearEndDate,
        policy.article612WaveASecondNoticeDeadlineMonthsBefore,
      ),
    },
    waveB: {
      firstNoticeWindowStart: waveBAnchor,
      firstNoticeWindowEnd: addDays(waveBAnchor, policy.article612WaveBFirstNoticeWindowDays - 1),
      // ★ WAVE_B의 2차 통보 기한만 "일" 단위다(요구사항서4.3 §5: "10일 전까지") —
      // WAVE_A/§61①과 달리 개월 단위가 아니므로 addDays(음수)로 계산한다.
      secondNoticeDeadline: addDays(input.firstYearEndDate, -policy.article612WaveBSecondNoticeDeadlineDaysBefore),
    },
  };
}

export interface Article612WaveComplianceInput {
  firstNotice: { sentAt: string; method: NoticeMethod } | null;
  secondNotice: { sentAt: string; method: NoticeMethod } | null;
}

export interface Article612ComplianceInput {
  firstYearEndDate: string;
  waveA: Article612WaveComplianceInput;
  waveB: Article612WaveComplianceInput;
}

export interface WaveComplianceResult {
  compensationObligationExists: boolean;
  failedRequirements: ('FIRST_NOTICE_MISSING_OR_LATE' | 'SECOND_NOTICE_MISSING_OR_LATE')[];
}

export interface Article612ComplianceResult {
  waveA: WaveComplianceResult;
  waveB: WaveComplianceResult;
  overallCompensationObligationExists: boolean;
}

function evaluateWave(schedule: Article611Schedule, wave: Article612WaveComplianceInput): WaveComplianceResult {
  const firstNoticeValid =
    wave.firstNotice != null &&
    wave.firstNotice.sentAt >= schedule.firstNoticeWindowStart &&
    wave.firstNotice.sentAt <= schedule.firstNoticeWindowEnd;

  if (!firstNoticeValid) {
    return { compensationObligationExists: true, failedRequirements: ['FIRST_NOTICE_MISSING_OR_LATE'] };
  }

  const secondNoticeValid = wave.secondNotice != null && wave.secondNotice.sentAt <= schedule.secondNoticeDeadline;
  if (!secondNoticeValid) {
    return { compensationObligationExists: true, failedRequirements: ['SECOND_NOTICE_MISSING_OR_LATE'] };
  }

  return { compensationObligationExists: false, failedRequirements: [] };
}

/**
 * §61②는 요구사항서4.3 §5에 근로자 응답 단계가 별도로 명시돼 있지 않다
 * (§61①과 달리 "근로자가 N일 내 미통보 시"라는 별도 창이 주어지지 않음) —
 * 그래서 촉구(1차 통지)와 사용자 시기지정(2차 통지) 두 단계만으로
 * 판정한다.
 */
export function determineArticle612Compliance(
  input: Article612ComplianceInput,
  policy: LeavePromotionPolicyConfig,
): Article612ComplianceResult {
  const schedule = computeArticle612Schedule(input, policy);
  const waveA = evaluateWave(schedule.waveA, input.waveA);
  const waveB = evaluateWave(schedule.waveB, input.waveB);

  return {
    waveA,
    waveB,
    overallCompensationObligationExists: waveA.compensationObligationExists || waveB.compensationObligationExists,
  };
}
