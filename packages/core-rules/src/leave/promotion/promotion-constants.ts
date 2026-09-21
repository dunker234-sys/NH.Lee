import { LeavePromotionPolicyConfig } from '../../types/policy-config';

/**
 * 근로기준법 §61의 강행적 법정 기한 — 이 숫자들을 이 파일 밖에 다시 적지
 * 않는다(단일 진실 소스). CLAUDE.md 절대 규칙4("법령 수치는 policy_config
 * 에서 읽는다, 코드에 상수로 넣지 않는다")의 드문 예외다: policy_config는
 * 여전히 "운영값"(회사가 이보다 이르게/엄격하게 조정 가능한 실제 적용
 * 기한)을 담고, 여기 리터럴은 그 운영값이 위반해선 안 되는 법정
 * 하한/상한 검증 기준이다(요구사항서4.3 §5의 ★). 회사가 이 값보다 이르게
 * (보수적으로) 설정하는 것은 허용하고, 늦추는 설정만 거부한다 —
 * 검증 방향은 promotion-deadline-policy-validator.ts가 정한다.
 */
export const ARTICLE_61_STATUTORY_LIMITS: LeavePromotionPolicyConfig = {
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
