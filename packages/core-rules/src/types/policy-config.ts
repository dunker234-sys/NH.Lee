/**
 * 법정 수치는 전부 여기로 주입받는다. 코드 어디에도 이 숫자들을 상수로
 * 하드코딩하지 않는다(CLAUDE.md 절대 규칙 4). 실제 값은 policy_config
 * 테이블에서 읽어 이 형태로 조립하는 것은 호출자(STEP 3.5 오케스트레이션)의
 * 몫이다 — 이 패키지는 DB를 모른다.
 */
export interface PolicyConfig {
  /** 480 — 1일 법정근로시간(§50②) */
  dailyStatutoryLimitMinutes: number;
  /** 2400 — 1주 법정근로시간(§50①) */
  weeklyStatutoryLimitMinutes: number;
  /** 720 — 40h 초과분 한도(§53①, 대법 2020도15393 판단 기준) */
  weeklyOvertimeCapMinutes: number;

  /** 1320 (22:00, 0시부터의 분) — 야간근로 시작 */
  nightStartMinuteOfDay: number;
  /** 360 (06:00) — 야간근로 종료 */
  nightEndMinuteOfDay: number;

  /** 0.5 — 연장근로 가산율(§56①) */
  overtimePremiumRate: number;
  /** 0.5 — 야간근로 가산율(§56③) */
  nightPremiumRate: number;
  /** 0.5 — 휴일근로 8h 이내 가산율(§56②1호) */
  holidayPremiumRateWithin8h: number;
  /** 1.0 — 휴일근로 8h 초과 가산율(§56②2호) */
  holidayPremiumRateExcess8h: number;

  /**
   * §54 휴게 기준. "근로시간 4h당 30분, 8h당 60분"을 소정근로 블록(≤법정
   * 일 근로시간)과 연장 블록에 각각 독립 적용한다(RULES.md 2장 참고).
   */
  breakTierThresholdMinutes: number; // 240
  breakTierMinutes: number; // 30
  breakFullTierThresholdMinutes: number; // 480
  breakFullTierMinutes: number; // 60

  /** 900 (15h) — 4주 평균 1주 소정근로시간 미만이면 주휴·연차 미적용(§18③) */
  ultraPartTimeWeeklyThresholdMinutes: number;

  /** 12 — 연차 발생 판단 시 "계속하여 5인 이상"이어야 하는 개월 수(시행령 §7의2③) */
  annualLeaveMinContinuousMonths: number;
}

/** STEP7: 연차 발생(§60①②④) 전용 정책값. */
export interface AnnualLeavePolicyConfig {
  /** 15 — 1년간 80% 이상 출근 시 발생 일수(§60①) */
  annualLeaveBaseDays: number;
  /** 25 — 가산 포함 총 상한(§60④) */
  annualLeaveMaxCapDays: number;
  /** 2 — 최초 1년 초과 매 N년마다 1일 가산(§60④) */
  annualLeaveSeniorityIntervalYears: number;
  /** 11 — 계속근로 1년 미만자의 개근월당 1일 가산 상한(§60②의 구조적 상한) */
  annualLeaveMonthlyAccrualMaxMonths: number;
  /** 80 — 출근율 판정 임계값(%, §60①) */
  annualLeaveAttendanceRateThresholdPercent: number;
  /** 900(15h) — 4주 평균 1주 소정근로시간 미만이면 연차 미적용(§18③).
   * PolicyConfig.ultraPartTimeWeeklyThresholdMinutes와 같은 값을 재사용한다. */
  ultraPartTimeWeeklyThresholdMinutes: number;
}

/**
 * STEP7: 연차 사용 촉진(§61) 통지 기한 전용 정책값. 회사가 이 값들을
 * 법정보다 이르게(보수적으로) 설정하는 것은 허용되지만, 늦추는 설정은
 * apps/api 오케스트레이션 레이어가 저장 시점에 거부해야 한다 — 그 검증의
 * 기준이 되는 법정 리터럴 상수는 leave/promotion/promotion-constants.ts에
 * 별도로 있다(이 인터페이스 자체는 "운영값"의 모양만 정의한다).
 */
export interface LeavePromotionPolicyConfig {
  /** 10 — §61①1문 서면 촉구 가능 기간(일) */
  article611FirstNoticeWindowDays: number;
  /** 6 — §61①1문 촉구 기준 시점(소멸 몇 개월 전) */
  article611FirstNoticeAnchorMonthsBeforeExpiry: number;
  /** 10 — §61①1문 근로자 사용시기 통보 기간(일) */
  article611EmployeeResponseWindowDays: number;
  /** 2 — §61①2문 사용자 시기지정 통보 기한(소멸 몇 개월 전) */
  article611SecondNoticeDeadlineMonthsBeforeExpiry: number;
  /** 10 — §61②1호 1차 촉구 가능 기간(일, 최초 발생분) */
  article612WaveAFirstNoticeWindowDays: number;
  /** 3 — §61②1호 1차 촉구 기준 시점(최초 1년 종료 몇 개월 전, 최초 발생분) */
  article612WaveAFirstNoticeAnchorMonthsBefore: number;
  /** 1 — §61②1호 2차 통보 기한(최초 1년 종료 몇 개월 전, 최초 발생분) */
  article612WaveASecondNoticeDeadlineMonthsBefore: number;
  /** 5 — §61②1호 단서 1차 촉구 가능 기간(일, 촉구 이후 발생분) */
  article612WaveBFirstNoticeWindowDays: number;
  /** 1 — §61②1호 단서 1차 촉구 기준 시점(최초 1년 종료 몇 개월 전, 촉구 이후 발생분) */
  article612WaveBFirstNoticeAnchorMonthsBefore: number;
  /** 10 — §61②1호 단서 2차 통보 기한(최초 1년 종료 며칠 전, 촉구 이후 발생분) */
  article612WaveBSecondNoticeDeadlineDaysBefore: number;
}

/** 탄력적/선택적 근로시간제 전용 정책값. 제도 도입 여부와 무관하게 값은 항상 주입받는다. */
export interface FlexibleWorkPolicyConfig {
  /** 2880 (48h) — 탄력적 2주제 특정 주 상한(§51①) */
  biweeklyWeeklyCapMinutes: number;
  /** 3120 (52h) — 탄력적 3개월/6개월제 특정 주 상한(§51의2①) */
  extendedWeeklyCapMinutes: number;
  /** 720 (12h) — 탄력적 3개월/6개월제 특정일 상한 */
  extendedDailyCapMinutes: number;
  /** 660 (11h) — 근무일 사이 연속 휴식(§51의2②, 6개월제 및 선택적 초과정산) */
  continuousRestMinutes: number;
  /** 14 — 6개월제 스케줄 확정 통보 기한(일 단위) */
  semiannualNoticeDaysBefore: number;
  /** 0.5 — 선택적 근로제 초과정산 시 평균 40h 초과분 가산율 */
  selectiveMonthlyOvertimePremiumRate: number;
}
