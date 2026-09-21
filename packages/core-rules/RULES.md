# 근로시간 계산 규칙 (packages/core-rules)

> 이 문서는 `src/`의 각 함수가 구현하는 근로기준법 조문과 판례, 그리고 그
> 판단 근거를 정리한다. 급여 담당자가 근로자 문의("이 2시간은 왜 이렇게
> 계산되었는가")에 답할 때, 또는 향후 법령 개정 시 어느 코드를 고쳐야
> 하는지 찾을 때 이 문서를 기준으로 삼는다.
>
> 모든 시나리오 번호(시나리오N)는 STEP 3 프롬프트에 명시된 40개 테스트
> 시나리오를 가리키며, 각 `*.spec.ts`의 `it()` 제목에 그대로 대응한다.
> 커버리지: 라인/함수/구문 99%대, 브랜치 95.7% (`pnpm test -- --coverage`로 확인,
> `jest.config`의 `coverageThreshold` 90%를 충족).

## 1. 대원칙과 미승인 실적 처리

근로시간은 사용자의 지휘·감독 아래 실제로 근로가 제공된 시간을 기준으로
산정한다(근로기준법 §50③). **사전 승인 여부는 근로시간의 성립 요건이 아니라
사후 검증 절차**다. 어떤 입력·설정 조합에서도 실제 타각이 존재하는
근로시간을 0으로 기록하지 않는다.

- 미승인 연장근로는 `unapprovedOvertimeMinutes`에 **전량 산입**되고
  `reviewFlags`에 `UNAPPROVED_ACTUAL`이 붙는다(시나리오3). 계획 시작보다
  이른 조기 출근도 동일하게 처리된다(시나리오4).
- **유일한 예외**: 관리자가 해당 시간을 "근로 미제공"으로 **명시 판정**한
  경우에만(`workNotProvidedJudgment.judged === true`) 그 시간이
  `unapprovedOvertimeMinutes`/`actualWorkMinutes` 집계에서 빠진다(시나리오5).
  판정 이력은 `breakdown[]`의 해당 항목 `note`에 사유와 함께 남는다(항목
  자체는 지우지 않고 `minutes:0`으로 바꿔 감사 추적성을 유지한다).
- **코드 리뷰 확인 결과**(`daily/daily-attendance.ts`): `unapprovedOvertimeMinutes`를
  0으로 만드는 코드 경로는 정확히 하나, `workNotProvidedJudgment?.judged === true`
  분기(137~143행)뿐이다. 결근 경로(`absenceResult()`)의 0은 "기록을 지운
  것"이 아니라 애초에 타각이 하나도 없어 계산할 대상이 없는 경우다.
- `workNotProvidedJudgment.reason`은 이 순수 함수 레벨에서는 선택 필드다.
  "사유 필수"라는 절차 요건(STEP 6.5)은 이 판정을 만드는 API/오케스트레이션
  레이어의 책임이며, 계산 엔진은 판정 여부만 받아 반영한다.

관련 파일: `daily/daily-attendance.ts`, `types/results.ts`.

## 2. 휴게시간 (§54)

**스케줄만으로 자동 공제하지 않는다.** 실제 타각(외출/복귀) 또는 "휴게
미부여" 신고가 스케줄상 휴게보다 항상 우선한다.

- 실제 `BREAK_OUT`/`BREAK_IN` 타각 쌍이 있으면 그 구간만 공제한다. 스케줄에
  동일 시간대 휴게가 있어도 이중 공제하지 않는다(시나리오8).
- `BREAK_OUT`만 있고 `BREAK_IN` 없이 `OUT`이 찍히면(41번째, 원 40개
  시나리오에는 없지만 대원칙상 반드시 처리해야 하는 입력) 그 구간을 공제하지
  않는다 — 실근로를 휴게로 둔갑시키지 않기 위해서다. `BREAK_IN_MISSING`
  플래그가 남는다.
- 타각이 전혀 없으면: "휴게 미부여" 신고 시 공제 0 + `BREAK_NOT_GRANTED`
  플래그(시나리오7). 신고가 없으면 §54 기준으로 **자기일관적인** 휴게시간을
  역산한다(시나리오6) — 아래 "휴게 필요시간 산출" 참고.
- 연장구간이 있으면 §54를 규정근로 블록(≤법정 8h)과 연장 블록에 **각각
  독립 적용**해 합산한다: `requiredBreak(W) = tierBreak(min(W,480)) +
  tierBreak(max(0,W-480))`. 09:00~22:00(연장 4h) → 60분+30분=90분이 필요하며,
  실제 제공된 휴게가 이에 미달하면 `warnings`에 대법원 2020도15393 인용
  경고를 남기되 **휴게를 강제로 더 빼지는 않는다**(시나리오9).
- **순환모순**(시나리오10): 체류시간 S에서 `W = S - requiredBreak(W)`를
  만족하는 자기일관적 휴게시간이 존재하지 않는 구간이 있다
  (`breakTierThresholdMinutes`/`breakFullTierThresholdMinutes` 조합에 따라
  기본값 기준 `S ∈ [240,270) ∪ [510,540) ∪ [780,810)`). 이 경우
  `CircularBreakContradictionError`를 던진다. 경계값(239/240/269/270/
  509/510/539/540)을 단위테스트로 고정해 회귀를 방지한다.

관련 파일: `break/break-resolution.ts`.

## 3. 교대·야간·근로일 귀속

- **근로일(work_date)은 시업일 귀속**이며, 이 값은 호출자(STEP 3.5)가
  이미 산출해 주입한다 — 계산 엔진은 절대 재파생하지 않는다(절대 규칙5).
  22:00 출근~익일 06:00 퇴근도 work_date는 출근일이다(시나리오11). 조식조
  05:00~14:00도 05:00~06:00이 야간이지만 work_date는 당일이다(시나리오13).
- **휴일 판정은 work_date와 별개로 역일(달력일) 분할**한다(시나리오12).
  `DailyCalculationInput.holidayStatusByCalendarDate`는 근무가 실제로 걸치는
  1~2개 역일 각각의 휴일 여부를 담으며, `night-holiday-attribution.ts`가
  세그먼트를 KST 자정 경계로 쪼갠 뒤 역일별로 조회한다. 휴일근로 8h
  누적 카운터도 **역일별로 독립** 집계된다 — 금 22:00~토 06:00 근무 중
  토요일만 휴일이면 토요일 세그먼트(6h)만 휴일근로로 잡히고 금요일
  세그먼트(2h)는 관여하지 않는다.
- 시각은 UTC(timestamptz)로 저장되고 work_date는 KST 기준이다. 05:00 KST
  타각(=전날 20:00 UTC)이 전날로 잘못 귀속되지 않음을 `time/work-date.spec.ts`와
  시나리오37로 검증한다.
- 야간근로(22:00~06:00)는 연장·휴일 여부와 무관하게 **항상 독립적으로
  가산**된다 — 아래 "가산 배율 합성" 참고.

관련 파일: `daily/night-holiday-attribution.ts`, `time/work-date.ts`.

## 4. 가산 배율 합성 (연장×야간×휴일 3축)

각 시간 세그먼트의 **지급배율**(기본급 1.0을 포함한 최종 배율):

```
지급배율 = 1.0 + holidayAddon + nightAddon (+ overtimeAddon, 단 holidayAddon>0이면 0)
```

- `nightAddon`(+0.5): 22:00~06:00과 겹치면 휴일·연장 여부와 무관하게 항상
  가산된다(시나리오14, 16).
- 휴일이 아닌 날: 그 세그먼트가 연장(일 8h 초과, 승인 여부 무관 — 미승인도
  동일 배율)이면 `overtimeAddon = +0.5`(§56①).
- 휴일인 날: 그날 역일 기준 누적 실근로 8h 이내는 `holidayAddon = +0.5`
  (§56②1호), 8h 초과는 `holidayAddon = +1.0`(§56②2호). **8h 초과분에는
  overtimeAddon을 별도로 더하지 않는다** — §56②는 §56①의 특칙이라 이미
  "휴일+연장"을 합친 최종값이기 때문이다(시나리오15의 핵심). 휴일 10h 근로
  → 8h는 1.5배, 2h는 2.0배(2.5배 아님).
- **승인 여부는 이 배율식에 전혀 등장하지 않는다.** `approvalStatus`
  (APPROVED/UNAPPROVED/N_A)는 `payBucket`(REGULAR/OVERTIME/HOLIDAY_NORMAL/
  HOLIDAY_EXCESS/BREAK)과 완전히 독립된 축이며, 오직 어느 분당 카운터
  (approved/unapproved)에 더할지와 `reviewFlags`에만 영향을 준다.

관련 파일: `daily/premium-rate.ts`.

## 5. 휴일근로·주휴

- 공휴일(법정) 근로는 `holidayStatusByCalendarDate`(호출자가
  `holiday_calendar`에서 판정해 주입)를 통해 휴일근로 가산 대상으로
  잡힌다(시나리오17).
- 주휴(§55①)는 1주 소정근로일 전부 개근 시 발생한다. 4주 평균 1주
  소정근로시간이 15h(`ultraPartTimeWeeklyThresholdMinutes`) 미만인
  초단시간 근로자는 개근해도 미적용된다(§18③, 시나리오18). 연차 미적용과
  조문 근거(§18③)는 같지만 판단 데이터(4주 평균 vs 계속근로 1년)가 달라
  `annual-leave-applicability.ts`와는 완전히 별도로 구현했다.

관련 파일: `weekly/weekly-paid-rest.ts`.

## 6. 주 52시간 — 한도 위반과 가산수당은 서로 다른 함수

두 산식을 **의도적으로 분리**했다(시나리오19/20이 "서로 다른 함수로
구현하고 각각 테스트"를 명시적으로 요구).

- **`checkWeeklyLimitViolation`**(형사처벌 판단, 대법원 2023.12.7.
  2020도15393): `violated = (주 총 근로시간 − 40h) > 12h`. 일별 8h 초과분
  합산이 아니라 **주 총량 하나로만** 판정한다. 월~금 각 10.5h(52.5h) →
  초과 12.5h → 위반. 월화 13h·수목 6h·금8h(46h) → 초과 6h → **위반 아님**
  (일별 8h초과 합산 10h는 판단 기준이 아니다). "1주"는 휴일을 포함한
  7일(§2①7호) — 휴일 8h 포함 주 54h → 위반(시나리오21). 미승인 연장도
  포함해 판정한다(시나리오22).
- **`calculateWeeklyOvertimePay`**(가산수당 산정): 일 8h초과분과, 그 나머지
  "규정근로" 합계의 40h초과분을 이중계산 없이 더한다:
  `dailyOvertime[d]=max(0,dailyTotal[d]-480)`,
  `weeklyBasisOvertime=max(0,Σ(dailyTotal[d]-dailyOvertime[d])-2400)`,
  `총 연장 = ΣdailyOvertime + weeklyBasisOvertime`. 위 두 번째 예시에서도
  10h(월화 각 5h)는 가산 대상이다(시나리오20).
- **적용 범위**: `calculateWeeklyOvertimePay`는 고정 8h/40h 기준이라 그 주에
  활성 유연근로제가 없는 직원에게만 쓴다. 탄력제 적용 주간은
  `flexible-work/`의 해당 모듈이 자기 상한 기준으로 처리한다.

관련 파일: `weekly/weekly-limit-violation.ts`, `weekly/weekly-overtime-pay.ts`.

## 7. 5인 미만 사업장

- 상시 5인 미만이면 연장·야간·휴일 **가산율만** 미적용된다(`premium-rate.ts`가
  마지막에 모든 `rateMultiplier`를 1.0으로 덮어쓴다) — **시간 분류
  (payBucket/야간 플래그)는 그대로 유지**한다. 산업안전보건법 야간작업
  특수건강진단 대상자 판정(STEP 9)은 사업장 규모와 무관하게 실제 야간근로
  사실이 필요하므로 분류 자체를 지우면 안 되기 때문이다. **휴게(§54)와
  주휴(§55①)는 5인 미만 분기와 무관하게 그대로 계산**된다 — 별도 스킵
  로직이 없다는 것 자체가 이 요구사항의 증명이다(시나리오23).
- 연차 적용 여부는 **완전히 별도 함수**(`determineAnnualLeaveApplicability`)로
  판단한다: 사유 발생일 전 1년 동안 **계속하여** 5인 이상이어야 한다
  (시행령 §7의2③). daily 엔진의 `isUnderFiveEmployees`(해당 근로일 시점
  판정)와는 다른 법적 기준이므로 서로 대체하지 않는다(시나리오24).
- 상시근로자수는 호출자가 근로일 시점 이력(`site_headcount_history`)에서
  주입하는 순수 입력값이다. 3월(4명)분을 6월(7명)에 재계산해도 호출자가
  3월 시점 값을 넣는 한 결과는 동일하다 — 이 엔진에는애초에 "현재" 상태를
  조회하는 코드 경로 자체가 없다(시나리오25, `daily-attendance.spec.ts`의
  대조군 테스트로 증명).

관련 파일: `daily/premium-rate.ts`, `under-five/annual-leave-applicability.ts`.

## 8. 유연근로제

모든 함수는 공통 가드로 시작한다: `assertFlexibleWorkEligible(worker,
agreementInPlace)` — 18세 미만/임신 중이면 `FlexibleWorkNotEligibleError`
(시나리오32), `labor_agreement`/`work_rule` 근거가 없으면(호출자가 조회해
boolean으로 주입) `FlexibleWorkAgreementMissingError`(시나리오40, "설정만으로는
활성화되지 않는다").

**범위 구분**: 40개 시나리오 문구를 그대로 따라, 26~28은 "검증"(위반 판정만),
29~31은 "계산/정산"(정산액까지 산출)으로 책임을 나눴다. **탄력적 근로제
(26~28)의 실제 가산수당 정산 로직은 이번 STEP 범위 밖**이다 — 필요 시점에
별도 작업으로 추가한다.

- `biweekly.ts`(2주제, §51①): 평균 40h 이내 + 특정 주 48h 상한(시나리오26).
- `quarterly.ts`(3개월제, §51의2①): 평균 40h + 특정 주 52h·특정일 12h
  상한(시나리오27).
- `semiannual.ts`(6개월제, §51의2): 위 상한 + 근무일 사이 연속 11시간 휴식
  (§51의2②) + 시행 2주 전 통보 기한(시나리오28).
- `selective-monthly.ts`(선택적 1개월, §52): 정산기간 총 근로시간 −
  (소정근로시간×근무일수) 초과분만 계산, 별도 상한 검증 없음(시나리오29).
- `selective-monthly-excess.ts`(선택적 1개월 초과정산): 연속 11시간 휴식 +
  매 1개월 평균 40h 초과분에 대한 가산율(분·배율을 분리 반환해 부동소수점
  분 값이 생기지 않게 한다). **`calculateWeeklyOvertimePay`(§56①)를 아예
  import하지 않는다** — 이 모드에서는 §56①이 적용되지 않기 때문이며,
  import 부재 자체가 그 보장이다(시나리오30, 테스트가 소스에 해당 import가
  없음을 직접 확인한다).
- `mid-resignation-settlement.ts`(중도 퇴사자 정산, §51의3): 근로한 각 주의
  40h 초과분 **전부**를 안분 없이 정산 대상으로 삼는다(시나리오31).

관련 파일: `flexible-work/*.ts`.

## 9. 단시간 근로자

소정 6h 근로자가 8h 근로 → 법정 8h 이내라 §56① 가산은 없지만, 소정 초과분
2h를 `scheduledExcessMinutes`에 별도 산출한다(기간제및단시간법상 규율 대상,
가산 여부는 노무 검토 확정 후 별도 반영 — 시나리오33). 이 필드는
`attendance_daily`에 대응 컬럼이 없어(STEP 1 스키마 기준) `breakdown`과
결과 객체에만 존재한다 — STEP 3.5가 컬럼 추가 여부를 결정해야 한다(§10 참고).

관련 파일: `daily/daily-attendance.ts`.

## 10. 휴가·결근·지각·조퇴

- `leave/leave-application.ts`: 승인된 휴가만 유급으로 확정하고
  (`confirmed:true`), 미등록(무단결근) 알림 대상에서 제외한다(시나리오34).
  반차/반반차는 정수 분 나눗셈(`/2`, `/4`, `Math.floor`)으로 환산한다 —
  0.5·0.25를 곱하지 않는다(부동소수점 금지). 반차(오전) + 오후 근무는
  `paidLeaveMinutes`(휴가 모듈 산출)와 `actualWorkMinutes`(daily 엔진의
  실제 타각 기반 계산)가 독립적으로 공존해 "4h 근로 + 4h 유급"이
  된다(시나리오35).
- `leave/absence.ts`: 지각(`computeLatenessMinutes`)·조퇴
  (`computeEarlyLeaveMinutes`)는 스케줄 대비 실제 IN/OUT 시각으로 산출한다.
  결근(`isAbsence`)은 그날 타각이 전혀 없을 때만 true다(시나리오36).

관련 파일: `leave/leave-application.ts`, `leave/absence.ts`.

## 11. 엣지 케이스

- 퇴근 타각 누락 → `status:'PENDING'`을 반환한다. **임의 값을 채우지
  않는다**(시나리오38).
- 동일 (type, recordedAt) 타각 중복 제출은 멱등 처리된다
  (`dedupePunches`, 시나리오39).
- IN 타각이 아예 없으면 `MissingClockInError`를 던진다(계산 불능, 조용히
  0을 반환하지 않는다).
- 근무가 실제로 걸치는 역일이 `holidayStatusByCalendarDate`에 없으면
  `InvalidCalculationInputError`를 던진다 — 휴일 여부를 임의로 기본값
  처리(false 등)하지 않는다.

## 12. 알려진 갭 / 후속 STEP에서 결정할 사항

- **`BREAK_IN_MISSING`**: 40개 시나리오에는 명시되지 않았지만, 대원칙
  ("실근로를 0으로 만들지 않는다")상 반드시 처리해야 하는 도달 가능한
  입력이라 자체적으로 추가했다(§2 참고).
- **`scheduledExcessMinutes`**: `attendance_daily`(STEP 1)에 대응 컬럼이
  없다. STEP 3.5가 컬럼을 추가할지, breakdown JSON만으로 충분할지 결정해야
  한다.
- **`reviewFlags[]` → `AttendanceDailyStatus` 축약 우선순위**: `reviewFlags`는
  배열(동시에 여러 개 가능)이지만 DB의 `AttendanceDailyStatus`는 단일
  enum이다. STEP 3.5 오케스트레이션은 다음 우선순위를 따른다:
  `UNAPPROVED_ACTUAL` > (`BREAK_NOT_GRANTED`/`BREAK_UNDER_PROVIDED`/
  `BREAK_IN_MISSING`) > `NORMAL`.
- **탄력적 근로제(26~28)의 가산수당 정산**: 위반 판정만 구현했고, 실제
  정산액 계산 로직은 범위 밖이다.
- **`workNotProvidedJudgment.reason` 필수 여부**: 이 순수 함수는 선택
  필드로 받는다. "사유 필수" 절차 요건은 STEP 6.5의 API 레이어가 강제해야
  한다.
- **PolicyConfig 실제 수치**: 이 패키지는 숫자를 하드코딩하지 않고 전부
  인자로 받는다 — 실제 법정 수치(§50, §56, §54 등)를 `policy_config`
  테이블에 채우는 것은 STEP 3.5/운영팀의 몫이다.

## 13. STEP 9 — 52시간 알림·야간작업 특수건강진단

- `weekly/weekly-alert-stage.ts`(`determineWeeklyAlertStage`): 요구사항서
  4.4②의 절대값·상대값 병행 임계값 중 먼저 도달하는 쪽(MIN)으로 주의/경고/
  위험 3단계를 판정한다. "초과" 단계는 별도 산식이 아니라
  `checkWeeklyLimitViolation`의 결과를 그대로 받아 최우선 적용한다 — 한도
  위반 판정(§1)과 알림 단계 판정이 서로 다른 두 산식으로 갈라지지 않게
  하기 위해서다. 소정근로시간이 낮은 단시간 근로자(예: 소정 20h)는 상대값
  임계(소정+연장한도×비율)가 절대값보다 먼저 도달해, 절대값만 썼다면
  놓쳤을 32h 시점에 위험 단계 알림을 받는다.
- `weekly/weekly-overtime-projection.ts`(`projectWeeklyOvertime`): 예측
  알림(요구사항서 4.4③). 이미 지난 실적 + 남은 계획근태를 합산해
  `checkWeeklyLimitViolation`/`determineWeeklyAlertStage`를 그대로
  재사용한다 — 계획이 실적으로 바뀌는 순간 같은 함수로 같은 결과가
  나오도록, 예측 전용 산식을 따로 만들지 않았다.
- `weekly/schedule-adjustment-suggestion.ts`(`suggestScheduleAdjustments`):
  예측 초과 해소용 스케줄 조정 "후보"만 계산한다. 가장 긴 근무일부터
  줄이며, 근로자 동의 없이 자동 확정하지 않는다(관리자에게 후보로만
  제시 — 요구사항서 4.4③).
- `health/night-work-health-checkup.ts`
  (`determineNightWorkHealthCheckupEligibility`): 산안법 §130·시행규칙
  별표22 제4호. ①(6개월간 00:00~05:00 포함 연속 8h 작업 월평균 4회 이상)과
  ②(6개월간 22:00~06:00 작업 월평균 60h 이상) 중 하나만 충족해도 대상이다.
  ①의 시간대(00:00~05:00)는 근기법 야간(22:00~06:00, §56③)과 다르므로
  별도 정책키로 주입받는다. 월평균 비교는 부동소수점 나눗셈이 아니라
  "누적값 >= 임계값×개월수"의 정수 곱셈 비교로 한다(절대 규칙6).
  `sumOverlapMinutesWithDailyBand`는 `daily/night-holiday-attribution.ts`의
  역일 분할·자정 걸침 밴드 판정 방식을 임의의 시간대에 일반화한 것이다.

관련 파일: `weekly/weekly-alert-stage.ts`, `weekly/weekly-overtime-projection.ts`,
`weekly/schedule-adjustment-suggestion.ts`, `health/night-work-health-checkup.ts`.

### STEP 9 갭

- 알림 수신자 에스컬레이션(근로자→+사업장관리자→+권역→+본사HR)과 중복
  발송 방지는 조직도·DB 조회가 필요해 이 패키지의 관심사가 아니다 —
  apps/api의 알림 라우팅 레이어가 담당한다(§12와 같은 경계).
  `NightWorkSession` 입력을 실제 타각에서 어떻게 구성하는지(휴게 처리,
  연속성 판단)도 마찬가지로 apps/api의 몫이다.
