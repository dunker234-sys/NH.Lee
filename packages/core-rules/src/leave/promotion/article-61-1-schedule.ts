import { LeavePromotionPolicyConfig } from '../../types/policy-config';
import { addDays, subtractMonths } from './date-arithmetic';

/** 서면(전자문서 포함) 요건 — §61은 통지 방식을 이 두 가지로 한정한다. */
export type NoticeMethod = 'WRITTEN_PAPER' | 'ELECTRONIC_DOCUMENT';

export interface Article611Schedule {
  firstNoticeWindowStart: string;
  firstNoticeWindowEnd: string;
  secondNoticeDeadline: string;
}

/** §61① — 1년 이상 근속자. 소멸 6개월 전 기준 10일 이내 서면 촉구,
 * 미통보 시 소멸 2개월 전까지 사용자가 시기지정 통보. */
export function computeArticle611Schedule(
  input: { leaveExpiryDate: string },
  policy: Pick<
    LeavePromotionPolicyConfig,
    'article611FirstNoticeAnchorMonthsBeforeExpiry' | 'article611FirstNoticeWindowDays' | 'article611SecondNoticeDeadlineMonthsBeforeExpiry'
  >,
): Article611Schedule {
  const firstNoticeWindowStart = subtractMonths(
    input.leaveExpiryDate,
    policy.article611FirstNoticeAnchorMonthsBeforeExpiry,
  );
  return {
    firstNoticeWindowStart,
    firstNoticeWindowEnd: addDays(firstNoticeWindowStart, policy.article611FirstNoticeWindowDays - 1),
    secondNoticeDeadline: subtractMonths(input.leaveExpiryDate, policy.article611SecondNoticeDeadlineMonthsBeforeExpiry),
  };
}

export interface NoticeRecord {
  sentAt: string; // YYYY-MM-DD
  method: NoticeMethod;
}

export interface EmployeeResponseRecord {
  receivedAt: string; // YYYY-MM-DD
  specifiedUsageDates: boolean;
}

export interface Article611ComplianceInput {
  leaveExpiryDate: string;
  firstNotice: NoticeRecord | null;
  employeeResponse: EmployeeResponseRecord | null;
  secondNotice: NoticeRecord | null;
}

export type Article611FailedRequirement = 'FIRST_NOTICE_MISSING_OR_LATE' | 'SECOND_NOTICE_MISSING_OR_LATE';

export interface PromotionComplianceResult {
  /** 절차 요건을 하나라도 충족하지 못하면 true — 증거가 없으면 항상 true
   * 쪽으로 기본값을 둔다(요구사항서4.3 §5, CLAUDE.md 절대 규칙2의 정신:
   * 근로자에게 불리한 방향으로 조용히 가정하지 않는다). */
  compensationObligationExists: boolean;
  failedRequirements: Article611FailedRequirement[];
}

/**
 * §61① 절차 준수 판정. 1차 촉구 자체가 없거나 창 밖이면 즉시 의무 있음—
 * 근로자 응답/2차 통지를 더 살피지 않는다(요구사항서4.3 §5 완료조건4).
 * 근로자가 기간 내 시기를 특정해 응답하면 2차 통지는 불요, 그렇지 않으면
 * 2차 통지가 기한 내 있어야만 의무가 없다.
 */
export function determineArticle611Compliance(
  input: Article611ComplianceInput,
  policy: LeavePromotionPolicyConfig,
): PromotionComplianceResult {
  const schedule = computeArticle611Schedule(input, policy);

  const firstNoticeValid =
    input.firstNotice != null &&
    input.firstNotice.sentAt >= schedule.firstNoticeWindowStart &&
    input.firstNotice.sentAt <= schedule.firstNoticeWindowEnd;

  if (!firstNoticeValid) {
    return { compensationObligationExists: true, failedRequirements: ['FIRST_NOTICE_MISSING_OR_LATE'] };
  }

  const responseDeadline = addDays(input.firstNotice!.sentAt, policy.article611EmployeeResponseWindowDays);
  const employeeRespondedInTime =
    input.employeeResponse != null &&
    input.employeeResponse.specifiedUsageDates &&
    input.employeeResponse.receivedAt <= responseDeadline;

  if (employeeRespondedInTime) {
    return { compensationObligationExists: false, failedRequirements: [] };
  }

  const secondNoticeValid = input.secondNotice != null && input.secondNotice.sentAt <= schedule.secondNoticeDeadline;

  if (!secondNoticeValid) {
    return { compensationObligationExists: true, failedRequirements: ['SECOND_NOTICE_MISSING_OR_LATE'] };
  }

  return { compensationObligationExists: false, failedRequirements: [] };
}
