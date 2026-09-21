# LEAVE_MANAGEMENT — STEP 7 휴가 관리

`packages/core-rules/src/leave/annual-leave/`+`leave/promotion/`(신규) +
`apps/api/src/modules/leave/`(신규) + `apps/api/src/common/policy/
{leave-policy-resolver,leave-accrual-basis-resolver}.service.ts`(신규).
admin-web UI는 이번 STEP 프롬프트에 요구되지 않아 범위 밖(STEP6.5 선례와
동일).

## 1. 왜 이 STEP이 필요했나

STEP1이 `LeaveType`/`LeaveBalance`/`LeaveRequest`/`LeavePromotionLog` 스키마와
`LeaveCategory`(9종 전부)를 이미 심어뒀고, STEP3의 `packages/core-rules`가
`applyLeave()`(반차/반반차 정수분할 환산)와
`determineAnnualLeaveApplicability()`(시행령§7의2③ 5인 연속 판정)를 이미
구현해뒀다. STEP3.5의 `attendance-input-builder.service.ts`도 승인된
`LeaveRequest`를 이미 읽어 근태 계산에 반영하고, `no-show-detection.service.ts`도
전일 휴가자를 이미 미등록 알림에서 제외하며, `RecalculationTriggerService.
onLeaveApproved()`도 이미 존재해 호출을 기다리고 있었다. 이 STEP은 그
앞단 — **연차 자동 계산(발생액수 산정), 신청·승인 워크플로우, 잔여일수
추적, 연차 사용 촉진(제61조) 절차, 보상휴가 환산** — 을 새로 만든다.

## 2. 핵심 설계 결정

- **`LeaveCategory` 신규 값 불필요**: 요구사항서4.3 §2의 9종이 이미 enum에
  1:1로 존재.
- **"출근 간주 기간"(§60⑥)은 기존 `EmployeeProtectedStatus`를 재사용**한다
  — 신규 `statusType` 값 4개(`INDUSTRIAL_INJURY_LEAVE`/`MATERNITY_LEAVE`/
  `CHILDCARE_LEAVE`/`REDUCED_WORKING_HOURS_CHILDCARE`)만 추가, 스키마
  변경 없음. 이 4가지는 근로자가 "신청"하는 휴가 유형이 아니라 사유
  발생 시 HR이 등록하는 신상 상태라 의미상으로도 맞다.
- **보상휴가(§57) 게이트는 `LaborAgreement.agreementType`을 재사용**한다
  — `labor-agreement-resolver.service.ts`의 `FLEXIBLE_WORK_AGREEMENT_TYPES`
  선례와 동일 패턴으로 `'COMPENSATORY_LEAVE'` 값만 추가.
  `convertOvertimeToCompensatoryLeave()`는 기존 `overtimePremiumRate` 등
  가산율 정책값을 그대로 재사용한다(신규 정책키 없음) — `premium-rate.ts`로
  확인: 그 값들은 "더해지는 가산분"이라(0.5 → 1.5배), 연장1h→보상휴가1.5h
  요구사항과 정확히 일치한다.
- **연차 발생·촉진 배치는 관리자 수동 트리거 HTTP 엔드포인트**다(STEP6.5
  조기출근 반복 탐지와 같은 이유 — 저빈도·기념일 단위 트리거, BullMQ
  자동 등록은 파일럿 검증 후 후속 작업).
- **★ 제61조 법정 기한은 `packages/core-rules/src/leave/promotion/
  promotion-constants.ts`에 리터럴 상수로 한 번만 적는다** —
  CLAUDE.md 절대 규칙4의 드문 예외다. `policy_config`는 여전히 회사가
  조정 가능한 **운영값**을 담고, 이 리터럴은 그 운영값이 위반해선 안
  되는 법정 하한/상한 검증 기준이다. `PUT /admin/leave/promotion-policy`가
  이 앱 최초의 런타임 `policy_config` 쓰기 API다(기존엔 seed 스크립트로만
  채워짐).
- **취소 시 정확한 복원을 위해 `LeaveRequest`에 `deductedDays`+
  `leaveBalanceId`를 승인 시점에 확정 저장**한다 — 이후 정책이 바뀌어도
  재계산하지 않고 그 값 그대로 되돌린다.
- **"급여 산출"(완료조건5)은 STEP11(급여 마감, 미착수) 이전 단계인
  `AttendanceMonthly.totals`까지를 뜻한다** — 기존 `recalculation.service.ts`가
  이미 하는 집계를, 휴가 승인 흐름이 실제로 만들어내는지 증명한다.

## 3. 스키마 추가

- `LeaveType.applicationDeadlineDaysBeforeUse`(nullable Int) — 신청 기한.
- `LeaveBalance.effectiveDate`/`expiryDate`(신규 필수 컬럼) — §61 촉진
  기한 계산의 유일한 앵커(이전엔 없었다). `@@unique([employeeId,
  leaveTypeId, referencePeriod])` 추가.
- `LeaveRequest.approverId`/`leaveBalanceId`/`deductedDays` 추가.
  `LeaveRequestStatus`에 `CANCEL_PENDING`(사후 취소 승인 대기) 추가.
- `LeavePromotionLog.dueDate`/`wave`(신규 `PromotionWave{WAVE_A,WAVE_B}`,
  §61②만)/`unusedDaysAtStep` 추가.
- 신규 모델 `CompensatoryLeaveConversion`(§57 환산 이력,
  `sourceOvertimeRequestId` 유니크로 중복 전환 방지).
- `EmployeeProtectedStatus`는 스키마 변경 없음(헤더 주석만 확장).

## 4. `packages/core-rules` 신규 함수(13개, 전부 TDD, 100% 커버리지)

- `leave/annual-leave/attendance-rate.ts` — §60① 출근율(출근간주 상쇄,
  정수 교차곱 판정).
- `leave/annual-leave/full-year-grant.ts` — §60①+★대법원 2021.10.14.
  2021다227100(정확히 1년만 근무 후 종료 시 0일).
- `leave/annual-leave/monthly-accrual.ts` — §60②(개근월당 1일, 최대 11일).
- `leave/annual-leave/seniority-addon.ts` — §60④(3년째부터 2년마다 1일).
- `leave/annual-leave/annual-leave-grant.ts` — 합성 진입점. `yearsOfService
  <1`이면 monthly 경로만 타므로 15일 발생 코드 경로 자체가 호출되지
  않는다 — 1년 기간제 11일 상한이 구조적으로 보장된다.
- `leave/annual-leave/fiscal-year-proration.ts`/
  `fiscal-vs-anniversary-reconciliation.ts` — 회계연도 중도입사 비례,
  퇴직 시 정산 비교.
- `leave/leave-unit-day-fraction.ts`, `leave/compensatory-leave-conversion.ts`.
- `leave/promotion/promotion-constants.ts` — ★ 법정 기한 유일 소스.
- `leave/promotion/promotion-deadline-policy-validator.ts` — ★ 완료조건3
  직접 증명.
- `leave/promotion/article-61-1-schedule.ts`/`article-61-2-schedule.ts` —
  ★ 완료조건4 직접 증명("증거 부재 → 보상의무 있음" 기본값).
- `leave/promotion/date-arithmetic.ts` — 말일 클램핑 개월 연산(단순
  `setUTCMonth`의 "11월31일→12월1일 밀림" 버그 방지).

## 5. `apps/api/src/modules/leave/` 엔드포인트

- `POST/GET /me/leave-requests`, `POST /me/leave-requests/:id/cancel`,
  `GET /me/leave-balances` — 본인 전용(OrgScope 없음).
- `/admin/leave/types` CRUD(`ADMIN`,`HQ_HR`만).
- `/admin/leave/requests` 조회·승인·반려(사유 필수)·취소승인·취소반려.
- `POST /admin/leave/accrual/run`, `POST /admin/leave/promotion/run`,
  `POST /admin/leave/promotion/:logId/record-response`,
  `GET /admin/leave/promotion/compliance` — 수동 배치 트리거 및 판정 조회.
- `PUT /admin/leave/promotion-policy` — ★ 통계적 최소값 검증(§2 참고).
- `POST /admin/leave/compensatory/convert`.

## 6. 실측으로 발견·수정한 버그 — 재계산 큐 잡 ID 레이스

`RecalculationTriggerService`가 `(employeeId, workDate)` 고정 잡 ID로
같은 날짜 중복 트리거를 접는 것은 의도된 설계다(STEP6.5). 하지만
`recalculateSingleDay()`는 daily 행을 커밋한 뒤에도 `recalculateWeek()`/
`recalculateMonth()`를 계속 수행하고, BullMQ는 그 전체 함수가 반환해야
잡을 "완료" 처리한다. 승인 직후 곧바로 취소하는 것처럼 같은 날짜를
아주 짧은 간격으로 재트리거하면, 첫 잡의 daily 계산은 이미 끝나 DB에
보여도(테스트의 `waitFor`가 여기서 먼저 통과해버린다) 그 잡 자체는
아직 "active"라 BullMQ가 두 번째 `add()`를 조용히 무시하는 레이스가
실제로 재현됐다(무거운 e2e 배치 부하에서만 드러날 만큼 창이 좁다).
`RecalculationTriggerService.enqueue()`에 `waitForPriorJobToSettle()`을
추가해, 같은 잡 ID가 아직 active/waiting/delayed면 짧게 폴링해 기다린
뒤에만 새로 추가하도록 고쳤다 — 흔한 경우(선행 잡이 없거나 이미
정리됨)에는 지연이 전혀 없다.

## 7. 테스트

- `test/leave-annual-leave-fixed-term.e2e-spec.ts` — 완료조건1.
- `test/leave-deemed-attendance.e2e-spec.ts` — 완료조건2.
- `test/leave-promotion-policy-validation.e2e-spec.ts` — 완료조건3.
- `test/leave-promotion-compliance.e2e-spec.ts` — 완료조건4.
- `test/leave-approval-to-payroll-flow.e2e-spec.ts` — 완료조건5.
- `test/leave-request-lifecycle.e2e-spec.ts`,
  `test/leave-compensatory-conversion.e2e-spec.ts`,
  `test/leave-balance-basis-me.e2e-spec.ts` — 요구사항 본문이 명시한
  보조 시나리오(반려 사유 필수, 취소 자동복원/사후승인, 보상휴가 게이트,
  본인 조회).

`packages/core-rules`는 13개 신규 파일 100% 커버리지(전체 34스위트
171테스트, 기존 109개 회귀 없음). `apps/api` e2e는 8개 신규 파일 15개
테스트 전부 통과, 기존 27개 파일도 회귀 없음 재확인.
