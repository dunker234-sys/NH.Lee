import { ARTICLE_61_STATUTORY_LIMITS } from './promotion-constants';
import { validatePromotionDeadlinePolicy } from './promotion-deadline-policy-validator';

describe('validatePromotionDeadlinePolicy — 요구사항서4.3 §5 ★ 완료조건3 직접 증명', () => {
  it('법정값 그대로면 유효하다', () => {
    const result = validatePromotionDeadlinePolicy(ARTICLE_61_STATUTORY_LIMITS);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('법정보다 더 엄격한(리드타임 김 + 창 짧음) 설정도 유효하다', () => {
    const result = validatePromotionDeadlinePolicy({
      ...ARTICLE_61_STATUTORY_LIMITS,
      article611FirstNoticeAnchorMonthsBeforeExpiry: 7, // 법정 6보다 이르게
      article611FirstNoticeWindowDays: 5, // 법정 10보다 짧게
    });
    expect(result.valid).toBe(true);
  });

  it('★ 2차 통보 기한 리드타임을 법정(2개월)보다 짧게(1개월) 설정하면 거부된다', () => {
    const result = validatePromotionDeadlinePolicy({
      ...ARTICLE_61_STATUTORY_LIMITS,
      article611SecondNoticeDeadlineMonthsBeforeExpiry: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        key: 'article611SecondNoticeDeadlineMonthsBeforeExpiry',
        candidateValue: 1,
        statutoryLimitValue: 2,
        rule: 'LEAD_TIME_MUST_BE_LONGER_OR_EQUAL',
      }),
    ]);
  });

  it('★ 1차 촉구 가능 기간을 법정(10일)보다 길게(15일) 설정하면 거부된다', () => {
    const result = validatePromotionDeadlinePolicy({
      ...ARTICLE_61_STATUTORY_LIMITS,
      article611FirstNoticeWindowDays: 15,
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        key: 'article611FirstNoticeWindowDays',
        candidateValue: 15,
        statutoryLimitValue: 10,
        rule: 'WINDOW_MUST_BE_SHORTER_OR_EQUAL',
      }),
    ]);
  });

  it('§61② WAVE_B 필드들도 같은 방향 규칙으로 검증된다', () => {
    const windowTooLong = validatePromotionDeadlinePolicy({
      ...ARTICLE_61_STATUTORY_LIMITS,
      article612WaveBFirstNoticeWindowDays: 6, // 법정 5보다 김
    });
    expect(windowTooLong.valid).toBe(false);

    const leadTimeTooShort = validatePromotionDeadlinePolicy({
      ...ARTICLE_61_STATUTORY_LIMITS,
      article612WaveBSecondNoticeDeadlineDaysBefore: 5, // 법정 10보다 짧음
    });
    expect(leadTimeTooShort.valid).toBe(false);
  });

  it('여러 필드가 동시에 위반되면 전부 보고한다', () => {
    const result = validatePromotionDeadlinePolicy({
      ...ARTICLE_61_STATUTORY_LIMITS,
      article611FirstNoticeWindowDays: 20,
      article612WaveAFirstNoticeAnchorMonthsBefore: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});
