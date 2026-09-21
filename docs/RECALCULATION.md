# RECALCULATION — STEP 3.5 근태 집계 오케스트레이션

`packages/core-rules`(순수 계산 엔진)와 STEP1 데이터 모델을 잇는 계층.
`apps/api/src/modules/recalculation/` 아래에 있다.

## 1. 처리 흐름

```
트리거(RecalculationTriggerService) → BullMQ 큐(attendance-recalculation)
  → RecalculationConsumer(SYSTEM 주체) → RecalculationService.recalculateSingleDay()
    → AttendanceInputBuilderService(DB → DailyCalculationInput)
    → PolicyConfigResolverService(policy_config → PolicyConfig)
    → payroll_close 게이트
    → core-rules calculateDailyAttendance()
    → attendance_daily upsert
    → recalculateWeek() → attendance_weekly upsert
    → recalculateMonth() → attendance_monthly upsert
```

잡 1개 = (employeeId, workDate) 1개. 잡 ID는 `${employeeId}_${workDate}`로 고정해
같은 날짜가 대기 중일 때 자연 중복제거된다(BullMQ 커스텀 잡 ID는 `:`를 허용하지
않아 구분자로 `_`를 쓴다).

## 2. calc_version / input_snapshot_hash

- `CALC_ENGINE_VERSION`(`calc-engine-version.ts`)은 core-rules 알고리즘이
  실질적으로 바뀔 때만 수동으로 올린다 — 매 실행마다 증가하는 카운터가 아니다.
- `input_snapshot_hash = sha256(canonicalJson({ punches, schedule, leave,
  holidayStatusByCalendarDate, isUnderFiveEmployees, overtimeApproved,
  resolvedPolicyConfig }))`. `resolvedPolicyConfig`를 포함하는 이유: 정책이
  바뀌었는데 DB 원본 행은 그대로면 해시가 그대로라 "변경 없음"으로 오판되는
  것을 막기 위해서다.

## 3. DLQ

별도 DLQ 큐를 두지 않는다. BullMQ 잡은 `attempts:3`(지수 백오프)로 등록되고,
전부 소진되면 BullMQ 네이티브 `failed` 목록에 남는다 — 이것 자체가 DLQ다.
`RecalculationOpsService.retryFailedJobs()`가 `queue.getFailed()`를 순회하며
`job.retry()`를 호출해 실패한 날짜만 재처리한다.

## 4. policy_config 신규 키

`PolicyConfigResolverService`가 요구하는 15개 키는 core-rules `PolicyConfig`
필드명과 1:1로 일치한다(`apps/api/prisma/recalculation-policy-defaults.ts`).
STEP1 seed.ts가 이미 심어 둔 `weekly_work_limit_minutes` 등 다른 이름/단위의
기존 키와는 섞어 쓰지 않는다(단위 혼동 방지). 값을 찾지 못하면 임의 기본값으로
채우지 않고 즉시 예외를 던진다(CLAUDE.md 절대 규칙 4).

## 5. labor_agreement.agreement_type 컨벤션(이번 STEP에서 신설)

스키마 §4의 `agreement_type`은 자유 문자열이라 유연근로제 유형을 가리는
컨벤션이 없었다. `labor-agreement-resolver.service.ts`가 다음 값을
"활성 유연근로 합의"로 인식한다(core-rules `flexible-work/` 모듈 파일명에 대응):
`FLEXIBLE_BIWEEKLY`, `FLEXIBLE_QUARTERLY`, `FLEXIBLE_SEMIANNUAL`,
`SELECTIVE_MONTHLY`. 실제 유형별 판정(제도별 상한 적용)은 이번 STEP 범위
밖이다 — 있으면 `flexibleWorkSkipped=true`로 표시만 하고 표준 52h 판정
(`checkWeeklyLimitViolation`/`calculateWeeklyOvertimePay`)을 건너뛴다.

## 6. 이번 STEP에서 다루지 않는 것 (알려진 갭)

- `breakNotGrantedReported`, `workNotProvidedJudgment`: 대응 DB 필드가
  아직 없다 — 각각 STEP8 정정 확장 / STEP6.5 판정 테이블이 생긴 뒤 배선한다.
  지금은 항상 `false`/`null`.
- `contractedDailyWorkMinutes`(시나리오33, 단시간 소정초과): `Employee`에
  일 단위 소정근로 필드가 없어 항상 `null` — 판정을 스킵한다.
- `paidLeaveMinutes` 산출 시 "그날 Schedule이 없는" 폴백: `Employee.
  contractedWorkMinutes`(주 단위)/5로 근사하고 경고를 남긴다. "표준 일일
  소정근로시간" 정책값이 생기면 교체해야 한다.
- 유연근로제 직원의 주간 위반 판정·가산 정산: `flexibleWorkSkipped=true`로
  명시적으로 건너뛴다(§5 참고). 실제 로직은 이번 STEP 범위 밖이다.
- correction 병합은 `PUNCH_MISSING`/`DEVICE_ERROR`/`NETWORK_FAILURE`만
  펀치로 해석한다 — `SCHEDULE_CHANGE`/`DISPATCH`/`LOCATION_ERROR`/`OTHER`는
  승인 기록만 되고 계산에는 아직 반영되지 않는다.
- 1주의 시작 요일(월요일, `week.util.ts`)은 하드코딩했다 — `policy_config`
  설정화 후보로 남긴다.
- 4주 평균 소정근로시간(`determineWeeklyPaidRest`용)과 payroll_close 게이트의
  site 판정은 그 주/그 날의 대표 사업장(`Schedule.siteId` → `punch_raw.siteId`
  → `Employee.primarySiteId` 우선순위, 주간 정책 조회는 `Employee.
  primarySiteId` 고정) 하나만 본다 — 같은 주 안에서 사업장을 넘나든 파견은
  이번 STEP에서 근사치로만 반영된다.
- Memurai Developer Edition은 로컬 개발 전용이다(10일마다 재기동 필요, 비상업
  라이선스) — 운영 배포 시 별도 Redis 조달이 필요하다(TECH_STACK.md 참고).

## 7. 검증

`apps/api/test/recalculation.e2e-spec.ts`가 완료 조건 4개를 전부 실제
PostgreSQL(`attendance_test`, app_rw)과 실제 Redis(Memurai)로 검증한다.
