# SCHEDULE_PLANNING — STEP 6 계획근태 관리

`apps/api/src/modules/schedule/`(신규) + `apps/api/src/common/policy/
{schedule-policy-resolver,site-labor-agreement-resolver}.service.ts`(신규) +
`packages/core-rules/src/schedule/`(신규) + `apps/admin-web/app/(authenticated)/
schedule/`(신규, admin-web 최초의 "실제 규모" 화면).

## 1. 왜 이 STEP이 필요했나

STEP1이 `Schedule`/`ShiftTemplate`/`LaborAgreement`를 이미 스키마에
심어뒀고(`Schedule.version`까지 포함 — 낙관적 잠금을 처음부터 예견),
STEP3의 `packages/core-rules`가 유연근로제 상한·서면합의 게이트를 순수
함수로 이미 구현해뒀다. 하지만 `Schedule`을 **쓰는** 코드가 전혀 없었다
— `recalculation` 모듈이 읽기만 했다. 이 STEP은 그 위에 처음으로 쓰기
경로(편성 생성·편집·확정)와 저장 시점 즉시 검증을 얹는다.

## 2. 스키마 추가

- `Employee.birthDate`(nullable) — 미성년 판정용. null이면 유연/선택
  근로제 배정을 "허용"이 아니라 "차단"으로 취급한다(보수적 기본값).
- `EmployeeProtectedStatus`(신규 모델) — 임신 등 민감한 보호 상태를
  `Employee` 본체와 분리 저장한다(LaborAgreement와 같은 "유효기간 있는
  별도 레코드" 패턴). 쓰기는 `POST /employees/:id/protected-status`
  (`@Roles('HQ_HR')` 단독)로만 가능하다.
- `ShiftTemplate.flexibleWorkType`(nullable String) — 이 템플릿으로 만든
  배정이 유연/선택 근로제의 어떤 유형인지. null=표준(비유연). 매
  스케줄 행마다 반복 지정하지 않고 템플릿에 귀속시켜 `Schedule.
  shiftTemplateId`를 통해 자동 상속되게 한다.
- `policy_config` 신규 키 7개(`schedule-policy-defaults.ts`) —
  `FlexibleWorkPolicyConfig`의 6개 필드 + `consecutiveWorkdayLimitDays`
  (STEP6 신규, 근기법에 명문 상한은 없으나 취업규칙 관행값 6일).
  `dailyStatutoryLimitMinutes` 등 겹치는 키는 `recalculation-policy-
  defaults.ts`가 이미 시딩했으므로 재선언하지 않는다 — 재선언하면
  `policy_config`의 `(key, effective_start_date) WHERE site_id IS NULL`
  부분 유니크 인덱스에 걸려 충돌한다(실제로 겪은 버그, §7 참고).

## 3. `packages/core-rules` 추가(TDD)

- `schedule/consecutive-rest.ts` — §51의2②/§52② 연속 11시간 휴식을
  유연근로제 전용이 아닌 범용 함수로 분리. `flexible-work/{semiannual,
  selective-monthly-excess}.ts`가 이 함수를 호출하도록 리팩터(동작
  무변경, 기존 스펙이 회귀 게이트).
- `schedule/consecutive-workday.ts` — 연속근무일수 상한(코어룰즈에
  전무했던 신규 규칙). 월 경계를 넘는 연속 구간도 하나의 run으로
  인식한다.
- `break/required-break-minutes.ts` — `break-resolution.ts`의 비공개
  §54 티어 함수를 추출해 export(무변경 리팩터).
- `schedule/planned-break-check.ts` — 계획 단계(타각 없음)에서 §54
  휴게 충족 여부 판정.
- 주 52시간 초과 예상은 신규 함수 없이 기존 `checkWeeklyLimitViolation`
  재사용(실적/계획 어느 쪽 `DailyTotal[]`이든 무관하게 동작).

## 4. `apps/api/src/modules/schedule/` 엔드포인트

전부 `@Roles('SITE_MANAGER','REGIONAL','HQ_HR','ADMIN')` + `@CurrentOrgScope()`
(레포지토리 계층에서 `assertSiteInScope`), 근로자 조회만 예외.

- `POST/GET/PATCH/DELETE admin/schedule/shift-templates`
- `GET admin/schedule/schedules?siteId=&yearMonth=` → `{scheduleGridVersion, rows}`
- `PATCH admin/schedule/schedules/:id` — `{expectedVersion, ...fields}`,
  `updateMany({where:{id,version:expectedVersion}})`의 `count===0`으로
  충돌 판정, 409 `SCHEDULE_VERSION_CONFLICT`.
- `PATCH admin/schedule/schedules/bulk` — 하나라도 충돌하면 트랜잭션
  전체 롤백, 409 `SCHEDULE_BULK_VERSION_CONFLICT`.
- `POST admin/schedule/rosters/generate` — 반복 규칙(`cycleLengthDays`+
  `pattern`+`anchorDate`)을 구체 행으로 펼쳐 `createManyAndReturn` 1회
  삽입. `workDate`는 매 행 `deriveWorkDateString(plannedStartAt)`로
  서버가 계산 — 클라이언트가 보낸 값을 신뢰하지 않는다.
- `POST admin/schedule/schedules/confirm` — hard-block 위반 시 400,
  미해결 soft-warning은 `override+overrideReason` 없이 400. 직원×
  년월 단위로 중복 제거해 `NotificationService.notify('SCHEDULE_
  CONFIRMED', ...)`.
- `POST admin/schedule/schedules/:id/cancel`, `:id/substitute`(결원·
  대체 투입 — 원 배정 행은 유지, 대체자용 새 행 생성).
- `GET/POST admin/schedule/excel/{template,validate,commit}` —
  파싱·검증은 서버(exceljs)에서만. validate가 그리드 지문을 비교해
  불일치 시 `conflictDiff`를 반환, commit이 커밋 시점에 지문을
  재검증해 validate~commit 사이 TOCTOU를 막는다.
- `GET admin/schedule/reports/schedule-vs-actual` — `AttendanceDaily`
  (STEP3 산출물)와 조인만 한다, 재계산 없음.
- `GET schedule/me[/yearly]` — 근로자 본인 조회, org-scope 아니라
  `employeeId===principal.employeeId` 자기 자신 체크.

### 409 충돌 바디는 `details` 아래에 둔다

`AllExceptionsFilter`(공통)는 예외 응답에서 `code/message/details`만
전달하고 나머지 최상위 필드는 버린다. 처음에 `{code, message,
conflicts}`처럼 최상위에 뒀다가 e2e 테스트가 `res.body.conflicts`가
`undefined`임을 잡아냈다 — 이 STEP의 모든 커스텀 에러(`schedule-
errors.ts`)는 구조화 데이터를 전부 `details` 아래에 둔다.

## 5. 검증 서비스 — hard/soft 분리 + 성능

`ScheduleValidationService.validate(targets, {skipSoftWarnings?})`.
**hard block**(override 불가): 미성년/임신+유연근로 배정, 서면합의
없음, 생년월일 미등록. **soft warning**(DRAFT 저장은 통과, CONFIRM은
override 필요): 52시간 초과 예상, 연속근무일 초과, 휴게 부족, 11시간
휴식 미확보, 유연근로 상한.

`roster-generation`/`excel` 커밋 경로는 `skipSoftWarnings:true`로
호출한다 — soft-warning 계산은 직원당 순차 DB 왕복(창 조회·템플릿
조회·생년월일 조회)이 여러 번 붙어 30명×30일 벌크 생성의 3초 예산을
위협하는데, 그 결과를 애초에 쓰지 않기 때문이다(hard-block은 전혀
건너뛰지 않는다).

## 6. `apps/admin-web` — 최초의 실제 규모 화면

- `lib/apiClient.ts` 토큰 갱신 인터셉터 — 401 시 `/auth/refresh` 1회
  시도 후 재시도. 동시에 여러 요청이 401을 맞으면 `refreshInFlight`로
  단일화한다 — 그렇지 않으면 두 번째 refresh가 첫 번째가 이미
  회전시킨(폐기된) refreshToken을 다시 제출하고, 서버의
  `RefreshTokenService`는 이를 탈취 신호로 보고 세션 체인을 통째로
  무효화한다(동시 요청이 로그아웃을 유발하는 사고).
- `app/(authenticated)/layout.tsx` — 최초의 인증 앱 셸(사이드바+세션
  가드). 기존 `punch/`도 이 그룹으로 이동.
- `app/(authenticated)/schedule/GridView.tsx` — 드래그-채우기.
  `mousedown`으로 시작 셀 기록 → `mouseenter`로 같은 행 안에서 선택
  범위 확장 → `mouseup`에 툴바의 "채우기 값"을 범위 전체에 복사한다.
  별도 DnD 라이브러리를 쓰지 않는다(컨테이너 간 이동이 아니라
  스프레드시트형 채우기 핸들 동작이라 그 라이브러리들의 문제와 다르다).
  셀은 네이티브 `<select>`가 아니라 `<div>`다 — `<select>`는
  `mousedown`에서 자체 드롭다운을 열어 드래그 제스처와 충돌한다.
- 저장 시 미저장 편집(`gridState.ts`)을 기존 행 편집(→`patchBulk`)과
  신규 셀(→`generateRoster`, 직원별 연속 동일값 구간을 run-length
  인코딩해 호출 수를 줄임)로 나눠 서로 다른 백엔드 경로로 보낸다.
- `ConflictDialog.tsx` — 409 응답의 `details.currentValue`를 그대로
  그려 추가 왕복 없이 "내 값/상대 값"을 비교한다.
- 확정 시 미해결 경고는 `window.confirm`/`window.prompt`가 아니라
  인페이지 패널로 사유를 입력받는다 — 최초 구현은 네이티브 다이얼로그를
  썼다가, 이 브라우저 자동화 환경이 네이티브 다이얼로그를 억제한다는
  것을 실측으로 발견해 인페이지 UI로 바꿨다(테스트 가능성뿐 아니라
  스타일 일관성도 개선).

## 7. 실측으로 발견한 버그(라이브 브라우저 검증)

1. **정책 키 중복 시딩** — `schedule-policy-defaults.ts`에
   `weeklyStatutoryLimitMinutes` 등 7개 키를 실수로 재선언했다가
   e2e 테스트(`loadPolicyConfigFixture()`+`loadSchedulePolicyConfigFixture()`
   동시 로드)가 `policy_config`의 부분 유니크 인덱스 충돌로 즉시 잡아냈다.
2. **라우트 순서 버그** — `@Patch(':id')`를 `@Patch('bulk')`보다 먼저
   등록해 `PATCH .../bulk`가 `id='bulk'`로 단건 편집에 매칭됐다. e2e
   테스트가 기대한 409 대신 400을 받아 발견 → 등록 순서를 바꿔 수정.
3. **예외 필터의 `details` 계약** — §4 참고. `res.body.violations`가
   `undefined`인 것을 e2e 테스트가 잡아냈다.
4. **네이티브 다이얼로그 억제** — §6 마지막 항목 참고. 실브라우저
   테스트에서만 드러났다.

## 8. 알려진 갭

1. **Excel 커밋의 in-memory 토큰 저장소** — `ScheduleExcelService`의
   `pending` Map은 이 서비스 인스턴스 메모리에만 산다. 단일 인스턴스
   배포를 전제로 한 한계 — 수평 확장 시 Redis 등 공유 저장소로
   옮겨야 한다.
2. **그리드에서 셀을 "휴무로 지우기"는 지원하지 않는다** — 드래그
   채우기는 항상 어떤 템플릿을 채우는 동작이고, `PATCH`는
   `shiftTemplateId`를 null로 지우는 경로가 없다. 필요해지면 별도
   "휴무" 값이나 `DELETE` 경로 추가가 필요하다.
3. **엑셀 재업로드는 같은 (직원, 근무일)에 이미 여러 행(분할 근무 등)이
   있으면 첫 번째 매치만 갱신한다** — `findFirst`로 조회하기 때문.
4. **결재선(승인 워크플로우) 없음** — STEP6의 확정은 즉시 저장이지
   다단계 승인이 아니다. 결재선은 STEP6.5의 몫으로 명시적으로
   남겨뒀다(요구사항 원문에도 없음).
5. **admin-web 드래그는 같은 행(직원) 안에서만 지원** — 여러 직원을
   가로지르는 사각형 선택은 범위 밖.

## 9. 검증 요약

`apps/api/test/schedule-{optimistic-locking,minor-flexible-block,
roster-generation,roster-generation-timing}.e2e-spec.ts`(실제
Postgres+Redis) + `packages/core-rules/src/schedule/*.spec.ts` +
`break/required-break-minutes.spec.ts` — 전부 통과 확인(core-rules
전체 스위트 99.34% 커버리지 유지). 실제 브라우저(Claude Browser
pane)로 `apps/api`+`apps/admin-web`을 동시에 띄워 로그인 → 드래그
채우기 생성 → 단일 셀 편집 → 확정(soft-warning 차단 확인) → 사유
기록 후 강제 확정(감사로그·알림 DB 직접 조회로 재확인) → 교대 패턴
생성/삭제(유연근로 유형 포함) → 리포트 화면까지 실제 종단 플로우를
확인했다(§7의 4가지 버그를 이 과정에서 실제로 발견·수정).
