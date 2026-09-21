import { LeavePromotionPolicyConfig } from '../../types/policy-config';
import { ARTICLE_61_STATUTORY_LIMITS } from './promotion-constants';

export type PromotionDeadlineRule = 'WINDOW_MUST_BE_SHORTER_OR_EQUAL' | 'LEAD_TIME_MUST_BE_LONGER_OR_EQUAL';

export interface PromotionDeadlineViolation {
  key: keyof LeavePromotionPolicyConfig;
  candidateValue: number;
  statutoryLimitValue: number;
  rule: PromotionDeadlineRule;
}

export interface PromotionDeadlinePolicyValidationResult {
  valid: boolean;
  violations: PromotionDeadlineViolation[];
}

// "*WindowDays"류 — 촉구/통보가 이뤄질 수 있는 기간의 "길이". 법정보다
// 길면 실제 통지가 더 늦게 이뤄질 여지가 생기므로 candidate <= 법정.
const WINDOW_KEYS: (keyof LeavePromotionPolicyConfig)[] = [
  'article611FirstNoticeWindowDays',
  'article611EmployeeResponseWindowDays',
  'article612WaveAFirstNoticeWindowDays',
  'article612WaveBFirstNoticeWindowDays',
];

// "*AnchorMonthsBefore*"/"*SecondNoticeDeadline*Before*"류 — 소멸/종료
// 시점 기준 선행 리드타임. 법정보다 짧으면 실제 캘린더 기한이 법정보다
// 늦어지므로 candidate >= 법정.
const LEAD_TIME_KEYS: (keyof LeavePromotionPolicyConfig)[] = [
  'article611FirstNoticeAnchorMonthsBeforeExpiry',
  'article611SecondNoticeDeadlineMonthsBeforeExpiry',
  'article612WaveAFirstNoticeAnchorMonthsBefore',
  'article612WaveASecondNoticeDeadlineMonthsBefore',
  'article612WaveBFirstNoticeAnchorMonthsBefore',
  'article612WaveBSecondNoticeDeadlineDaysBefore',
];

/**
 * 요구사항서4.3 §5 ★ — policy_config로 §61 촉진 기한을 조정하더라도,
 * 법정 기한보다 늦어지는 설정은 저장 시점에 거부한다. 회사가 이 값들을
 * 법정보다 이르게(보수적으로) 설정하는 것은 항상 허용한다.
 */
export function validatePromotionDeadlinePolicy(
  candidate: LeavePromotionPolicyConfig,
): PromotionDeadlinePolicyValidationResult {
  const violations: PromotionDeadlineViolation[] = [];

  for (const key of WINDOW_KEYS) {
    const candidateValue = candidate[key];
    const statutoryLimitValue = ARTICLE_61_STATUTORY_LIMITS[key];
    if (candidateValue > statutoryLimitValue) {
      violations.push({ key, candidateValue, statutoryLimitValue, rule: 'WINDOW_MUST_BE_SHORTER_OR_EQUAL' });
    }
  }

  for (const key of LEAD_TIME_KEYS) {
    const candidateValue = candidate[key];
    const statutoryLimitValue = ARTICLE_61_STATUTORY_LIMITS[key];
    if (candidateValue < statutoryLimitValue) {
      violations.push({ key, candidateValue, statutoryLimitValue, rule: 'LEAD_TIME_MUST_BE_LONGER_OR_EQUAL' });
    }
  }

  return { valid: violations.length === 0, violations };
}
