# ROADMAP — 전사 근태관리 시스템

STEP 상세 프롬프트 원본은 `02_ClaudeCode_단계별_프롬프트세트_v2.md`를 참고한다.
이 문서는 STEP 순서와 각 STEP의 목적·완료 조건을 요약해 진행 상황을 추적하기 위한
것이며, 상세 구현 지시는 원본 프롬프트를 따른다.

**진행 원칙**
- STEP은 한 번에 하나씩만 진행한다. 큰 STEP 착수 전에는 Plan Mode로 계획을 먼저 검토한다.
- 법령 수치는 하드코딩하지 않고 `policy_config`에서 읽는다.
- 어떤 최적화도 실근로 사실의 기록을 축소하는 방향으로는 하지 않는다.
- 각 STEP의 【완료 조건】을 충족했는지 확인한 뒤 커밋하고 다음 STEP으로 넘어간다.

**⚠ Phase 0 선행 조건**: 아래 4가지가 노무 검토로 확정되기 전에는 STEP 3에 착수하지 않는다
(CLAUDE.md 1장 참고). 나중에 바꾸면 전 기간 재계산이 필요하다.
1. 미승인 연장근로 처리 (v2 기준: 전량 산입 + 검토 플래그)
2. 근로일 귀속 규칙 (v2 기준: 시업일 귀속 + 휴일 판정은 역일 분할)
3. 휴게시간 처리 (v2 기준: 자동 공제 금지)
4. 퇴근 미등록 시 계획 시각 자동 적용 여부 (v2 기준: 기본 비활성)

---

## STEP 전체 순서

| STEP | 내용 | Phase | 상태 |
|---|---|---|---|
| 0 | 프로젝트 컨텍스트 & CLAUDE.md | 1 | ✅ 완료 |
| 1 | 데이터 모델 | 1 | ✅ 완료 |
| 2 | 스캐폴딩 + 인증/권한 (+SYSTEM 주체) | 1 | ✅ 완료 |
| **3** | **근로시간 계산 엔진 ★최중요** | 1 | ✅ 완료 |
| **3.5** | **근태 집계 오케스트레이션 ★신설** | 1 | ✅ 완료 |
| 4 | 출퇴근 등록 API | 1 | ✅ 완료 |
| **4.5** | **알림 발송 인프라 ★신설** | 2 | ✅ 완료 |
| 5-A | 근로자 모바일 앱 | 2 | 🟡 구현 완료·실기기 검증 대기 |
| **5-B** | **공용 키오스크 + PC 웹 타각 ★신설** | 2 | ✅ 완료 |
| 6 | 계획근태·교대 패턴 | 2 | 대기 |
| **6.5** | **연장·외근·조기출근 승인 워크플로우 ★신설** | 2 | 대기 |
| 7 | 휴가 관리 | 2 | 대기 |
| **7.5** | **개시 데이터 이관 ★신설** | 3 | ✅ 완료 |
| 8 | 근태 정정 + 감사로그 | 2 | ✅ 완료 |
| 9 | 52시간 알림 + 준법 리포트 + 대시보드 | 2 | ✅ 완료 |
| 10 | HR 연동 어댑터 (급여보다 먼저) | 3 | ✅ 완료 |
| 11 | 급여 마감·연동 | 3 | 대기 |
| 12 | 보안·성능·배포 | 4 | 대기 |

---

## STEP 0. 프로젝트 컨텍스트 설정

CLAUDE.md, TECH_STACK.md, ROADMAP.md 작성. 코드는 작성하지 않는다.

**완료 조건**
- CLAUDE.md에 절대 규칙 8개가 모두 들어가 있다
- ROADMAP.md에 STEP 0~12(3.5/4.5/5-A/5-B/6.5/7.5 포함) 순서가 정리되어 있다
- 코드 파일이 생성되지 않았다

## STEP 1. 데이터 모델 설계

PostgreSQL 마이그레이션(Prisma/TypeORM)으로 전체 스키마 설계. `punch_raw`/
`punch_location` 분리, `site_headcount_history`, `holiday_calendar`, 감사 로그
2테이블 분리(`access_log`/`audit_log`), `policy_config`, 낙관적 잠금용 `version`
컬럼 등. ERD를 mermaid로 먼저 제시하고 확인받은 뒤 마이그레이션·시드 데이터 작성.

**완료 조건**
- [x] 요구 테이블이 모두 생성되고 마이그레이션이 정상 실행된다 — 로컬 PostgreSQL 17에
  `prisma migrate deploy`로 32개 테이블 적용 확인 (`apps/api/prisma/migrations/`)
- [x] `punch_raw`에 위치 좌표 컬럼이 없다 — `\d punch_raw`로 확인, 좌표는 `punch_location` 1:1 분리
- [x] 시드 데이터로 5인 미만 사업장, 일용·단시간 근로자 케이스를 조회할 수 있다 —
  `SITE-003`(평균 4명, `is_under_five=true`)에 DAILY/PART_TIME/REGULAR/CONTRACT 각 1명 시드,
  쿼리로 검증
- [x] 파티셔닝 권고 대상 테이블 목록이 문서로 남았다 — [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
- 부가 확인: `app_rw` 롤로 `punch_raw` UPDATE/DELETE 시도 시 권한 오류 발생을 실제로 확인 (STEP 8에서 재검증 예정)

## STEP 2. 스캐폴딩 + 인증/권한

pnpm workspace 모노레포 스캐폴딩. 사번+비밀번호 JWT 인증, 기기 바인딩(차단이 아닌
LOW 레벨 기록), RBAC + 조직 스코프 이중 필터, SYSTEM 주체 1급 개념화.

**완료 조건**
- [x] 다른 사업장 데이터 조회 시도가 거부된다 — `test/org-scope.e2e-spec.ts`,
  SITE_MANAGER가 타 사업장 조회 시 403 `ORG_SCOPE_DENIED` 확인
- [x] 스코프 미지정 쿼리가 런타임 에러를 발생시킨다 —
  `src/modules/employees/employees.repository.spec.ts`, `assertScope(undefined)`가
  `OrgScopeRequiredError`를 던지는 것을 직접 호출로 확인
- [x] SYSTEM 컨텍스트 더미 배치의 전사 조회가 audit_log에 남는다 —
  `test/system-batch.e2e-spec.ts`, 5명·2개 사업장 전체 조회 + `scope_bypassed=true`
  audit_log 행 확인
- [x] 미등록 기기 로그인 시 타각이 차단되지 않고 LOW 레벨로 기록된다 —
  `test/auth.e2e-spec.ts`(200 응답, `deviceTrust=false`) +
  `test/punch-verification-level.e2e-spec.ts`(`punch_raw.verification_level='LOW'`
  실제 DB 저장 확인)
- 부가 확인: `punch_raw`는 리포지토리에 update/delete 메서드가 없고(코드 레벨),
  `app_rw` 연결로 raw UPDATE/DELETE 시도 시 권한 오류(DB 레벨) — 둘 다 통과.
  유닛 8건 + e2e 18건 전부 실제 로컬 PostgreSQL(`attendance_test`)로 실행해 확인.
  상세 설계는 [`docs/AUTH_RBAC.md`](docs/AUTH_RBAC.md) 참고.

## STEP 3. 근로시간 계산 엔진 ★최중요

> Plan Mode로 계획 선검토. **Phase 0 노무 검토 완료 후 착수.**

`packages/core-rules`에 순수 함수로 구현. DB·프레임워크 의존 없음. 기본/휴게/
교대·야간·근로일 귀속/휴일·주휴/주 52시간(한도 위반 vs 가산수당 2종 분리)/5인 미만/
유연근로제/단시간/휴가·예외/엣지 케이스 등 40개 시나리오를 TDD로 먼저 작성.

**완료 조건**
- [x] 40개 시나리오 테스트 전부 통과, 커버리지 90% 이상 — 실제로는 90개
  테스트(40개 시나리오 + 경계값/엣지 자체 보강)가 전부 통과하며, 커버리지는
  라인/함수/구문 99%대, 브랜치 95.7%로 `coverageThreshold` 90%를 상회
  (`pnpm --filter @attendance/core-rules test -- --coverage`로 실행 확인)
- [x] `packages/core-rules/RULES.md`에 계산 규칙과 근거 조문 정리
- [x] 미승인 실적이 0으로 계산되는 코드 경로가 없음을 코드 리뷰로 확인 —
  `daily/daily-attendance.ts`에서 `unapprovedOvertimeMinutes`를 0으로
  만드는 경로는 `workNotProvidedJudgment.judged===true` 분기 하나뿐임을
  grep으로 재확인(RULES.md 1장 참고)
- 개발 중 STEP 2의 Plan agent 리뷰와 같은 방식으로 설계를 사전 검증했고,
  구현 중 `break-resolution`의 실제 버그(휴게 파생 시 `breakMinutes`와
  `breakSegments`가 불일치해 실제로는 공제되지 않는 문제)를 테스트가
  잡아내 즉시 수정했다.

## STEP 3.5. 근태 집계 오케스트레이션 ★신설

계산 엔진과 DB를 잇는 `RecalculationService` + BullMQ 컨슈머. (사번×일자) 체크포인트,
DLQ, 멱등 재계산, 일→주→월→52시간 판정 전파. SYSTEM 주체로 실행.

**완료 조건**
- [x] 타각 저장 후 5초 이내 attendance_daily 생성 — `test/recalculation.e2e-spec.ts`,
  실제 Memurai(Redis 7.4 호환)로 `onPunchSaved()` → BullMQ 컨슈머 → 5초 이내
  행 생성 확인
- [x] 정정 승인 → 일·주·월·52시간 판정 자동 갱신 통합 테스트 통과 — 같은 파일,
  `PUNCH_MISSING` 정정(`APPROVED_L1`) 승인 후 `attendance_daily`/`attendance_weekly`
  (`limitViolationFlag=true`, 5인+토요일 3960분 > 40h+12h 한도)/`attendance_monthly`
  전부 갱신 확인
- [x] 동일 재계산 3회 실행 결과 동일(멱등성) — `recalculateSingleDay` 3회 연속
  호출, `calculatedAt` 제외 전 필드 및 `input_snapshot_hash` 동일 확인
- [x] 중간 실패 후 재실행 시 처리된 건 스킵, 실패분만 재처리 — 3일 배치 중
  가운데 날짜를 실제 `CircularBreakContradictionError`(13시간 체류, 휴게
  타각·스케줄 전무 — 어떤 휴게 후보로도 자기일관성 불만족)로 실패시킨 뒤,
  입력(휴게 타각 추가)을 고치고 `retryFailedJobs()` 호출 → 실패일만
  재처리되고 나머지 2일의 `calculatedAt`은 그대로임을 확인
- 개발 중 Plan agent 리뷰로 원 설계의 구조적 공백 3가지(스키마에 결과를
  담을 컬럼 없음, 유연근로제 직원 주간 판정 분기 누락, correction 병합
  범위 과다)를 찾아 반영했고, 구현 중 실제 버그(BullMQ 커스텀 잡 ID를
  `audit_log.job_id`(UUID 컬럼)에 그대로 넣어 SYSTEM 컨텍스트 실행이
  매번 실패하던 문제)를 e2e 테스트가 잡아내 즉시 수정했다.
  상세 설계·갭 목록은 [`docs/RECALCULATION.md`](docs/RECALCULATION.md) 참고.

## STEP 4. 출퇴근 등록 API

`POST /punches`. 서버 산출 멱등키, 지오펜스(반경 밖도 거부하지 않고 LOW+검토 큐),
NFC 기본/QR 예비(TOTP), 부정 사용 탐지(차단 아닌 플래그, iOS는 NOT_SUPPORTED 명시),
오프라인 벌크 업로드, 미등록 감지 배치.

**완료 조건**
- [x] 동일 타각 5회 중복 전송해도 1건만 저장 — `test/punches.e2e-spec.ts`,
  5개 동시 요청 → `punch_raw` 1건 + 4건 `duplicate:true` 확인(멱등키 유니크
  제약 위반을 캐치하는 방식이라 동시 요청 경쟁조건에서도 안전)
- [x] client_event_id를 바꿔 재전송해도 중복 저장 안 됨 — 같은 파일, 다른
  `clientEventId`로 재전송해도 `duplicate:true` + 행 1개 유지 확인
- [x] 지오펜스/기기/QR 실패 시에도 타각이 저장됨 — 같은 파일, 반경 밖(외근
  승인 없음/있음 양쪽)·미신뢰 기기·NFC 태그 불일치·QR 정책 비활성·QR TOTP
  불일치 전부 200/201 응답 + `punch_raw` 저장 + `LOW` 판정으로 확인(거부
  응답이 아예 없다)
- [x] iOS mock location 탐지가 false가 아닌 NOT_SUPPORTED로 기록 — 같은
  파일, `platform:'IOS'` → `integrityFlags`에 문자열 토큰
  `'MOCK_LOCATION_NOT_SUPPORTED'` 존재(불리언 아님) 확인
- [x] 타각 API P95 1초 이내(100건 동시) — `test/punches-p95.e2e-spec.ts`,
  서로 다른 100명 직원의 동시 요청으로 측정, P95 713~778ms(여러 차례 실행,
  전부 1000ms 미만). 초기 구현은 요청당 정책값 조회가 최대 22회 DB 왕복이라
  100건 동시 부하에서 P95가 920~1000ms대로 불안정했다 — 11개 키를 site+전사
  값 한 번에 가져오는 단일 쿼리로 바꿔 해결(연결 풀 경합이 실제 원인이었음을
  프로파일링 없이도 재현 가능한 측정으로 확인)
- 오프라인 벌크 업로드(`POST /punches/bulk`, 건별 성공/중복/실패 배열,
  단말 시계 조작 탐지)와 부정사용 비동기 탐지 3종(이동속도/좌표반복/기기공유),
  미등록 감지 배치는 완료조건표에 없지만 요구사항서 4.1 본문에 명시된
  기능이라 전부 구현·검증했다 — `test/punches-bulk.e2e-spec.ts`,
  `test/fraud-detection.e2e-spec.ts`, `test/no-show-detection.e2e-spec.ts`.
- 상세 설계·갭 목록은 [`docs/PUNCHES.md`](docs/PUNCHES.md) 참고.

## STEP 4.5. 알림 발송 인프라 ★신설

`device_token` 관리 + `NotificationService`(push/email/in-app, 재시도+DLQ,
`alert_log`, 중복 발송 방지, 야간 발송 제한, 다국어). CLAUDE.md에 "NotificationService
경유 전용" 규칙 추가(이미 5장에 반영됨).

**완료 조건**
- [x] 더미 알림이 push/email 두 채널로 발송되고 alert_log에 기록 —
  `test/notifications.e2e-spec.ts`, `notify('DUMMY_TEST', ...)` → 두
  `alert_log` 행(`channel='PUSH'`/`'EMAIL'`) 모두 `result='SUCCESS'`,
  `sentAt` 기록, `dedupKey`가 채널별로 다름을 확인
- [x] 동일 알림 2회 요청해도 1회만 발송 — 같은 파일, 동일한 (수신자,
  유형, targetPeriod, stage)로 `notify()`를 **동시에**(`Promise.all`)
  2번 호출 → 채널당 `alert_log` 행이 정확히 1개(총 2개, 4개 아님)임을
  확인(경쟁조건까지 실제로 검증)
- [x] 발송 실패 시 재시도, 최종 실패는 DLQ에 남음 — 같은 파일,
  `forceFail:true` → `retryCount>=3` 확인 후 `result='FAILED_FINAL'`
  도달, `queue.getFailed()`에 `id===alertLog.id`인 잡 존재 확인
- 완료조건표에 없지만 요구사항서 본문에 명시된 기능(동의 억제, 조용시간
  억제+urgent 예외, en/vi 템플릿 폴백, in-app 배너, device_token
  등록/갱신)도 전부 구현·검증했다 — 같은 파일 + `test/device-token.e2e-spec.ts`.
- 상세 설계·갭 목록은 [`docs/NOTIFICATIONS.md`](docs/NOTIFICATIONS.md) 참고.

## STEP 5-A. 근로자 모바일 앱

React Native(Expo). 출퇴근 큰 버튼 홈, 오프라인 큐(expo-sqlite), iOS 강제종료 제약
전제 설계, 위치 포그라운드 권한만, 개인정보 화면(수집 일시중지/열람/철회), 접근성,
다국어(ko/en/vi). 화면 흐름 제안 후 확인받고 구현.

`apps/mobile`(9개 화면 전부 구현 — 실제 API: 인증/타각/기기토큰/알림이력/
동의/위치확인자료/사업장, 목업 API: 스케줄·휴가·신청함·내근태·52시간
게이지, STEP6~9 착수 시 `src/api/index.ts` 배선만 교체). 화면 8·9와 타각
사업장 선택에 필요했으나 STEP1~4.5에 없던 백엔드 4종(`GET /sites`,
`Consent` CRUD, `GET /alert-log`, `GET /location-access-log`)을 self-scoped
읽기/쓰기 엔드포인트로 신규 추가 — 상세는
[`docs/SELF_SERVICE_ENDPOINTS.md`](docs/SELF_SERVICE_ENDPOINTS.md).

**완료 조건** — 4개 전부 실기기(EAS dev client) 최종 검증이 필요하며, 이
저장소 작업만으로는 Apple Developer/Firebase 계정이 없어 실기기 검증까지
마칠 수 없다. 아래는 시뮬레이터 없이 자동화 가능한 절반(서버 멱등성·큐
상태기계 로직)까지 검증한 상태이고, 나머지 절반(iOS 프로세스 킬 자체의 OS
동작)은 [`apps/mobile/docs/MANUAL_VERIFICATION.md`](apps/mobile/docs/MANUAL_VERIFICATION.md)에
절차를 남겼다.
- [ ] 비행기모드 타각 → 강제종료 → 재실행 → 복구 시 자동 전송, 서버 1건만
  저장 — 서버 측 멱등성 절반은 `apps/mobile/src/offline/__tests__/
  punchQueueLogic.test.ts`(재전송 시 recordedAt/clientEventId/deviceId
  불변 확인, node:sqlite)로 자동 검증. 실기기의 실제 강제종료→재실행은
  MANUAL_VERIFICATION.md §1.
- [ ] 위치 동의 거부 시에도 앱 동작 + 대체 수단 안내 — `ConsentGateScreen`/
  `PunchScreen`이 동의 거부 시 GPS 권한 요청 자체를 건너뛰고 NFC/QR/키오스크
  안내 배너로 유도하도록 구현·타입체크·번들 확인 완료, 실기기 UI 확인은
  MANUAL_VERIFICATION.md §2.
- [ ] 일시중지 버튼으로 위치 수집 중단 + 이력 저장 — 서버 측(`Consent` 이력
  기록, self-scoping)은 `apps/api/test/consent.e2e-spec.ts`로 완전 자동
  검증 완료. 앱 UI 확인은 MANUAL_VERIFICATION.md §3.
- [ ] 홈 진입~타각 완료 2탭 이내 — `HomeScreen`의 출근/퇴근 버튼이 곧
  타각 트리거라 일반 경로는 1탭으로 설계·구현됨, 실기기 확인은
  MANUAL_VERIFICATION.md §6.

부수적으로 확인한 것: `apps/mobile`/`apps/api` 전체 `tsc --noEmit` 통과,
`expo export --platform android|ios` 양쪽 Metro 번들 성공(1100+ 모듈, 0
에러), `apps/mobile`의 오프라인 큐 순수 로직 Jest 16개 전부 통과, 신규
백엔드 4종의 e2e 10개 전부 통과(`apps/api/test/{sites,consent,alert-log,
location-access-log}.e2e-spec.ts`), 기존 STEP0~4.5 e2e 63개 회귀 없음 재확인.

## STEP 5-B. 공용 키오스크 + PC 웹 타각 ★신설

`apps/kiosk`(태블릿, React+Vite), 사번+PIN/QR, 5초 이내 완료, 3초 자동 초기화, 개인정보 최소
노출, 오프라인 로컬 저장. PC 웹 타각(IP 허용목록, `apps/admin-web` 최소 부트스트랩 —
로그인+타각 위젯만, 본격 확장은 STEP6). QR 표시 모드는 STEP 4의
`qr_verification_policy` 따름.

백엔드는 기존 `PunchesService.create()`를 그대로 재사용하는 얇은 신규
파이프라인(`apps/api/src/modules/{kiosk-devices,kiosk-punches}/`, 기기
자격증명 인증 — JWT/PrincipalGuard 완전 우회)과, 기존 `POST /punches`에
붙는 작은 신뢰 분기 1곳 + `IpAllowlistGuard` 1개가 전부다. 상세 설계·갭
목록은 [`docs/KIOSK_AND_PC_PUNCH.md`](docs/KIOSK_AND_PC_PUNCH.md) 참고.

**완료 조건**
- [x] 사번+PIN 10명 연속 타각 각 5초 이내 — `test/kiosk-punches-timing.
  e2e-spec.ts`, 실제 Postgres+Redis에서 10명 순차 `POST /kiosk/punches`
  호출, 개별 응답시간 전부 5000ms 미만 확인. 실제 브라우저(apps/kiosk를
  실행 중인 API에 붙여)로도 페어링→사번+PIN 타각→마스킹된 이름 표시→
  3초 후 자동 초기화까지 실측 확인.
- [x] 오프라인 → 복구 시 중복 없이 전송 — `test/kiosk-offline-recovery.
  e2e-spec.ts`, 동일 payload로 `POST /kiosk/punches/bulk`를 2회(재연결
  재시도 흉내) 호출해도 `punch_raw` 1건만 남음을 확인. 오프라인 큐 순수
  로직(재전송 시 페이로드 불변, 상태 전이)은 `apps/kiosk/src/offline/
  __tests__/*`가 시뮬레이터 없이 Node에서 검증.
- [x] PC 웹 허용목록 밖 IP 접근 시 타각 차단 + 사유 안내 — `test/
  ip-allowlist.e2e-spec.ts`(실제 배선) + `guards/ip-allowlist.guard.spec.
  ts`(임의 IP 허용/차단을 가짜 ExecutionContext로 결정적 검증) + 실제
  브라우저로 `apps/admin-web` 로그인 후 PC 타각 성공을 확인 — 이 과정에서
  "localhost가 브라우저 요청마다 `::1`/`::ffff:127.0.0.1`로 다르게
  해석되는" 실측 버그를 발견해 `IpAllowlistGuard`의 IP 정규화를 수정했다.

## STEP 6. 계획근태(스케줄) 및 교대 패턴 ✅ 완료

교대 패턴 템플릿, 편성 화면(월간 그리드, 엑셀 업/다운로드), 낙관적 잠금(`version`,
변경 셀만 전송, 409 시 충돌 UI), 편성 즉시 검증(52시간/연속근무/휴게/유연근로 상한/
11시간 휴식/미성년·임신 근로자 차단), 결원·대체 투입.

STEP1이 이미 심어둔 `Schedule`/`ShiftTemplate`/`LaborAgreement` 스키마와
STEP3의 `packages/core-rules` 유연근로제 순수 함수 위에, 처음으로 쓰기
경로(`apps/api/src/modules/schedule/`)와 저장 시점 즉시 검증을 얹었다.
`apps/admin-web`도 이번에 처음 실제 규모의 화면(인증 앱 셸+월간 그리드)을
갖췄다. 상세 설계·발견한 실버그·알려진 갭은
[`docs/SCHEDULE_PLANNING.md`](docs/SCHEDULE_PLANNING.md) 참고.

**완료 조건**
- [x] 동시 편집 충돌 테스트에서 변경 소실 없음 — `test/schedule-
  optimistic-locking.e2e-spec.ts`: (a) 같은 셀 동시 PATCH → 하나만 성공,
  패자는 409+서버 현재값 반영 확인, (b) 벌크 PATCH 부분 충돌 시 전체
  롤백(유효했던 셀도 미반영 확인), (c) 엑셀 validate~commit 사이 그리드
  변경 시 commit이 그리드 지문 재검증으로 차단(TOCTOU 방지). 실제
  브라우저로 드래그 채우기 생성/단건 편집 저장까지 종단 확인.
- [x] 미성년 근로자 탄력근무 배정 시 저장이 차단된다 — `test/schedule-
  minor-flexible-block.e2e-spec.ts`: 만 18세 미만 및 생년월일 미등록
  둘 다 400 `SCHEDULE_HARD_BLOCK`으로 차단, 아무 행도 저장되지 않음을
  확인(전부-아니면-없음). 성인 대조군은 정상 배정됨도 확인.
- [x] 야간 걸침 시프트의 work_date가 시업일로 생성된다 — `test/schedule-
  roster-generation.e2e-spec.ts`: `deriveWorkDateString(plannedStartAt)`를
  오라클로 직접 호출해 대조, `plannedEndAt` 기준이 아님을 명시적으로 반증.
- [x] 30명×30일 편성이 3초 이내 — `test/schedule-roster-generation-
  timing.e2e-spec.ts`: 900행 벌크 생성 420.6ms(3000ms 기준 대비 큰 여유).

부수적으로 확인한 것: `packages/core-rules` 전체 21개 스위트 109개 테스트
통과(신규 스케줄 검증 함수 포함, 커버리지 99.34% 유지), `apps/api`/
`apps/admin-web` 전체 `tsc --noEmit` 통과, 기존 STEP0~5-B e2e 20개 파일
72개 테스트 전부 회귀 없음 재확인(신규 4개 파일 8개 포함 총 24개 파일
80개 테스트 전부 통과). 실제 브라우저(apps/api+apps/admin-web 동시 구동)로
로그인 → 편성 그리드 드래그 채우기 생성 → 단건 편집 저장 → 확정(soft-
warning 차단 확인) → 사유 입력 후 강제 확정(감사로그·알림 발송 DB
직접 재조회로 확인) → 교대 패턴 생성/삭제(유연근로 유형 포함) → 계획
대비 실적 리포트까지 실제 종단 플로우를 확인했다 — 이 과정에서 정책키
중복 시딩, 컨트롤러 라우트 등록 순서, 예외필터의 `details` 계약,
네이티브 `confirm()`/`prompt()` 다이얼로그가 브라우저 자동화 환경에서
억제되는 문제까지 4가지 실버그를 실측으로 발견해 수정했다.

## STEP 6.5. 연장·외근·조기출근 승인 워크플로우 ✅ 완료

`overtime_request`(사전/사후 신청, 관리자 일괄 승인), `dispatch_request`(외근·출장,
지오펜스 예외), 조기 출근 반복 패턴 탐지, "근로 미제공" 판정(사유 필수, 감사로그),
결재선(조직도 기반, 대결/위임), 미승인 초과 타각 월간 리포트.

STEP1이 이미 심어둔 `overtime_request`/`dispatch_request`(`bulk_approval_
batch_id`까지 예견) 스키마와, STEP3 `packages/core-rules`가 이미 완전히
구현해 둔 "근로 미제공" 제외 로직·STEP3.5의 `resolveOvertimeApproved()`·
STEP4의 `GeofenceService` 지오펜스 예외 위에, 이번에 처음으로 그 승인
데이터를 **생산**하는 API(`apps/api/src/modules/approval/`)를 얹었다.
admin-web UI는 이번 STEP 프롬프트에 요구되지 않아 범위 밖. 상세 설계·
실측으로 발견한 버그는 [`docs/APPROVAL_WORKFLOW.md`](docs/APPROVAL_WORKFLOW.md) 참고.

**완료 조건**
- [x] 미승인 실적 → 사후 신청 → 일괄 승인 → 집계 전환 통합 테스트 통과 —
  `test/approval-overtime-bulk.e2e-spec.ts`: `OvertimeRequest`를 전혀
  만들지 않은 상태에서 일괄 승인 한 번으로 `{requestType:'POST',
  status:'APPROVED'}` 생성 + `unapprovedOvertimeMinutes→0`/
  `approvedOvertimeMinutes>0` 집계 전환, 감사로그 `OVERTIME_BULK_APPROVED`
  확인까지.
- [x] "근로 미제공" 판정은 사유 없이 저장 불가, 감사로그에 전/후 값 남음 —
  `test/approval-work-not-provided.e2e-spec.ts`: 사유 누락 400, 최초
  판정/재판정 둘 다 `audit_log.beforeValue`/`afterValue` 확인(재판정의
  `beforeValue`가 직전 판정 내용과 일치), 판정 후 재계산으로
  `unapprovedOvertimeMinutes===0`(core-rules 기존 로직 발동 확인)까지.
- [x] 외근 승인 상태에서 반경 밖 타각 정상 처리 —
  `test/approval-dispatch-geofence.e2e-spec.ts`: 사후 신청→관리자 승인
  후 그 기간 내 반경 밖 타각이 `OUT_OF_GEOFENCE_*` 플래그 없이 저장,
  대조군(승인 없음)은 플래그 있음(회귀 방지) 확인.
- [x] 미승인 실적 잔존 시 STEP 11 마감 차단 —
  `test/approval-payroll-close-guard.e2e-spec.ts`: `PayrollCloseGuardService.
  hasUnresolvedUnapprovedActuals()` 직접 호출 + `GET .../payroll-close/
  readiness` 둘 다 `true→false`(일괄 승인으로 해소) 전환 확인.

부수적으로 확인한 것: `packages/core-rules`는 이번 STEP에서 변경 없음
(계산 로직이 이미 STEP3에서 완성돼 있었다) — 21개 스위트 109개 테스트
그대로 회귀 없음 재확인. `apps/api` 전체 `tsc --noEmit` 통과. 기존
STEP0~6 e2e 24개 파일 80개 테스트 전부 회귀 없음 재확인(신규 4개 파일
7개 포함 총 28개 파일 87개 테스트 전부 통과). 이 과정에서 실측으로
발견한 버그 1건: 재계산 큐(`RECALCULATION_QUEUE_NAME`)가 `(employeeId,
workDate)` 고정 잡 ID를 쓰는데 `removeOnComplete` 옵션이 없어, 이미
완료된 잡과 같은 ID로 다시 트리거하면(승인 후 재계산처럼 같은 날짜를
두 번째로 트리거하는 경로) BullMQ가 재처리 없이 조용히 기존 완료 잡을
반환하는 문제 — `recalculation.module.ts`에 `removeOnComplete: true`를
추가해 고쳤다(§7 상세, `docs/APPROVAL_WORKFLOW.md`).

## STEP 7. 휴가 관리 ✅ 완료

연차 자동 계산(제60조①②④, 1년 기간제 11일 경계 판례, 출근 간주 기간, 초단시간 미적용),
휴가 유형별 설정(보상휴가는 labor_agreement 필요, 가산율 반영), 신청·승인, 잔여일수
산출 근거 조회, 연차 사용 촉진(제61조①/② 독립 절차, 법정 기한보다 늦은 설정 저장 거부).

STEP1이 이미 심어둔 `LeaveType`/`LeaveBalance`/`LeaveRequest`/
`LeavePromotionLog` 스키마와 STEP3의 `packages/core-rules`가 이미
구현해 둔 `applyLeave()`/`determineAnnualLeaveApplicability()` 위에,
이번에 처음으로 **연차 자동 계산(발생액수 산정)·신청승인 워크플로우·
연차 사용 촉진 절차**를 얹었다. admin-web UI는 범위 밖(STEP6.5 선례와
동일). 상세 설계·실측으로 발견한 레이스 버그는
[`docs/LEAVE_MANAGEMENT.md`](docs/LEAVE_MANAGEMENT.md) 참고.

**완료 조건**
- [x] 1년 기간제 연차 11일(15일 아님) — `test/leave-annual-leave-fixed-
  term.e2e-spec.ts`: 정확히 365일 근무 후 종료, 11개월 개근 → `grantedDays
  ===11`, `.not.toBe(15)` 명시 단언, `basis.reasonCode==='MONTHLY_ACCRUAL'`
  확인(대법원 2021.10.14. 2021다227100).
- [x] 육아휴직 3개월이 결근으로 계산되지 않음 — `test/leave-deemed-
  attendance.e2e-spec.ts`: §60⑥ 출근간주 기간(`EmployeeProtectedStatus`
  statusType='CHILDCARE_LEAVE') 안의 결근 20건이 상쇄돼
  `attendanceRatePercent>=80`, `grantedDays===15` 확인.
- [x] 촉진 기한을 법정보다 늦게 설정 시 저장 거부 — `test/leave-
  promotion-policy-validation.e2e-spec.ts`: 리드타임 단축/창 연장 각각
  400 `LEAVE_PROMOTION_POLICY_STATUTORY_VIOLATION` + DB 미저장 확인,
  법정값 그대로/더 엄격한 값은 저장 허용 확인.
- [x] 촉진 절차 1단계 누락 시 "보상의무 있음" 판정 — `test/leave-
  promotion-compliance.e2e-spec.ts`: 1차 촉구 로그 없음 →
  `compensationObligationExists===true`,
  `failedRequirements`에 `FIRST_NOTICE_MISSING_OR_LATE` 포함 확인.
- [x] 승인 → 근태 반영 → 급여 산출 통합 테스트 통과 — `test/leave-
  approval-to-payroll-flow.e2e-spec.ts`: 신청→승인→잔액 차감→
  `AttendanceDaily.paidLeaveMinutes` 반영→미등록 알림 제외→
  `AttendanceMonthly.totals` 반영→감사로그까지 end-to-end 확인.

부수적으로 확인한 것: `packages/core-rules`에 신규 13개 파일(연차
발생·촉진 계산) 전부 TDD로 추가, 100% 커버리지, 기존 21개 스위트
109개 테스트 회귀 없음(총 34개 스위트 171개 테스트 통과). `apps/api`
전체 `tsc --noEmit` 통과. 신규 e2e 8개 파일 15개 테스트(완료조건 5개
+ 반려사유필수/취소생명주기/보상휴가게이트/본인조회 보조 시나리오
3개) 전부 통과, 기존 STEP0~6.5 e2e 27개 파일도 회귀 없음 재확인. 이
과정에서 실측으로 발견한 레이스 버그 1건: `RecalculationTriggerService`의
고정 잡 ID 재사용이 승인 직후 즉시 취소처럼 같은 날짜를 아주 짧은
간격으로 재트리거하면, 선행 잡의 daily 계산이 DB에 이미 반영됐어도
그 잡 자체(recalculateWeek/Month 포함)가 아직 BullMQ상 active라 두
번째 트리거가 조용히 유실되는 레이스 — `waitForPriorJobToSettle()`
추가로 고쳤다(§6 상세, `docs/LEAVE_MANAGEMENT.md`).

## STEP 7.5. 개시 데이터 이관 ★신설 ✅ 완료

개통 기준일 설정, leave_balance 개시 잔액/촉진 통지 이력/마감 완료 과거월 집계
(`source='MIGRATION'`, punch_raw에는 넣지 않음)/기존 교대 패턴·확정 스케줄 이관.
엑셀 템플릿, dry-run, 행 단위 검증 오류, 사업장별 근로자 단위 차이 리포트(0이 될
때까지 개통 승인 차단).

핵심 발견: `RecalculationService.assertPayrollOpen()`이 이미 `PayrollClose.
status`로 재계산을 막고 있어서, 마감 완료 과거월 이관 시 대응하는
`PayrollClose{status:'CLOSED'}` 행만 함께 만들면 재계산 컨슈머를 전혀
건드리지 않고도 이관 데이터 클로버링이 방지된다(`docs/MIGRATION_CUTOVER.md`
§2). 엑셀 dry-run/commit은 STEP6 `schedule-excel.service.ts`의 2단계
패턴(파싱→행단위 검증→commitToken→commit)을 그대로 복제했다.

**완료 조건**
- [x] 50명 규모 샘플이 dry-run에서 오류 없이 검증 —
  `apps/api/test/migration-dryrun-50-employee.e2e-spec.ts`
- [x] 의도적 오류 1건 삽입 시 해당 근로자를 리포트가 지목 —
  `apps/api/test/migration-row-error-report.e2e-spec.ts`(잔액 음수/존재하지
  않는 사번 2가지 케이스)
- [x] 검증 미통과 사업장은 개통 승인 버튼 비활성화 —
  `apps/api/test/migration-reconciliation-cutover-approval.e2e-spec.ts`(API
  레벨: 대사 불일치 시 `POST .../approve`가 400 `CUTOVER_RECONCILIATION_
  NOT_ZERO`로 거부), `apps/admin-web/app/(authenticated)/migration/page.tsx`
  (UI 레벨: `disabled={!readiness?.ready}`)

추가로 `apps/api/test/migration-payroll-close-protection.e2e-spec.ts`가
위 핵심 발견(재계산 자동 차단)을 직접 증명한다.

## STEP 8. 근태 정정 및 감사로그 ✅ 완료

원본 불변 원칙(DB 롤 권한으로 UPDATE/DELETE 회수, 트리거는 보조 수단), 정정 신청·
승인(1차 사업장→2차 권역/HQ), 직권 정정(HQ_HR만), 감사 기록 2테이블 분리
(access_log 단순 append-only / audit_log 해시 체인+Merkle 루트, 직렬화 삽입),
마감된 월은 재마감 절차로만 반영.

핵심 발견: STEP1이 이 STEP을 예상하고 스키마(`CorrectionRequest`
2단계 상태, `AuditLog` 해시 체인 쓰기, `AuditLogMerkleRoot` 테이블,
`punch_raw` 권한 회수)와 STEP3.5의 재계산 소비 경로(`onCorrectionApproved()`,
`gatherEffectivePunches()`의 임시 컨벤션)를 이미 심어뒀다 — 이 STEP은
신청/승인 API, `afterValue` 스키마 확정, `punch_raw` 보조 트리거,
Merkle 봉인·무결성 검증 배치를 새로 만드는 데 집중했다(`docs/
CORRECTION_AND_AUDIT.md` §1). 재마감(마감취소→재마감, 버전+차분리포트)
전체 사이클은 STEP11 소관으로 남겨두고, STEP8은 마감월 정정을 신청·
승인 두 시점 모두에서 차단하는 데까지만 한다(§6).

**완료 조건**
- [x] app_rw 롤의 punch_raw UPDATE 시도가 권한 오류 —
  `apps/api/test/punch-raw-immutability.e2e-spec.ts`(회귀),
  `apps/api/test/punch-raw-append-only-trigger.e2e-spec.ts`(신규 트리거가
  UPDATE 권한을 가진 `migrator`까지 막는 2차 방어선임을 추가로 증명)
- [x] 컬럼 추가+backfill 마이그레이션 정상 실행 —
  `apps/api/prisma/migrations/20260911110456_step8_correction_and_audit_integrity/migration.sql`
  (트리거 설치 직후 `punch_raw.integrity_flag_count` 컬럼을 추가하고
  `DISABLE/ENABLE TRIGGER`로 backfill, 같은 마이그레이션 안에서 성공)
- [x] 100건 동시 상태 변경에서도 해시 체인 미분기 —
  `apps/api/test/audit-log-concurrency.e2e-spec.ts`
- [x] 무결성 검증 배치가 정상 데이터에 오탐 없음 —
  `apps/api/test/audit-integrity-verify.e2e-spec.ts`(봉인 전/후, 재봉인
  멱등성 포함)
- [x] 정정 승인 시 일·주·월·52시간·급여 산출 데이터 모두 갱신 —
  `apps/api/test/correction-approval-recalculation.e2e-spec.ts`(1차
  승인만으로 `AttendanceDaily`/`AttendanceWeekly`/`AttendanceMonthly`
  전부 갱신됨을 확인 — STEP9/11이 그 데이터를 소비)

추가로 `apps/api/test/correction-closed-period-block.e2e-spec.ts`(§6
경계 증명)와 `apps/api/test/correction-report-and-audit-log-report.e2e-spec.ts`
(조회 화면 필터·엑셀 내보내기)가 요구사항서 4.7·4.10의 나머지 항목을
검증한다.

## STEP 9. 52시간 알림 · 준법 리포트 · 대시보드 ✅ 완료

한도 위반(형사처벌 대상, 40h초과분>12h)과 가산수당 산정을 별도 함수로 분리, 절대값·
상대값 병행 알림 임계(주의/경고/위험/초과), 예측 알림, 준법 리포트(미등록/조기출근
반복/미승인 미판정/야간작업 특수건강진단 대상), 본사·사업장 대시보드.

핵심 발견: 한도위반(§53①, 대법 2020도15393)·가산수당(§56①) 분리 산식은
STEP3(`packages/core-rules/src/weekly/weekly-limit-violation.ts`,
`weekly-overtime-pay.ts`)에서 이미 완성돼 있었다 — 이번 STEP은 그 위에
알림 4단계 판정(`weekly-alert-stage.ts`, 절대·상대값 중 먼저 도달하는
쪽), 예측(`weekly-overtime-projection.ts`+`schedule-adjustment-suggestion.ts`),
야간작업 특수건강진단(`health/night-work-health-checkup.ts`, 산안법
시행규칙 별표22 제4호)을 신규 순수 함수로 추가했다. 미승인 실적 미판정
리포트는 STEP6.5의 `ApprovalReportService.unapprovedOvertimeReport()`를
그대로 재사용했다(승인·판정되면 `UNAPPROVED_ACTUAL` 상태를 벗어나므로
그 자체가 이미 "미판정" 필터다) — 새 로직을 만들지 않았다.

실측으로 발견한 성능 회귀 1건: 재계산 잡(`RecalculationConsumer`)이
같은 잡 안에서 직접 52시간 알림을 평가하게 했더니, 커넥션 풀
(`connection_limit=10`)을 재계산과 알림 평가가 함께 경합해 STEP4의
타각 API P95가 677ms→1.6~2.0s로 흔들렸다 — 알림 평가를 별도 큐
(`weekly-alert` 모듈, 낮은 동시성)로 물리적으로 분리해 해결했다(상세는
`apps/api/src/modules/weekly-alert/weekly-alert.module.ts` 주석).

**완료 조건**
- [x] 소정 20h 근로자가 주 32h에서 초과 알림 수신 —
  `packages/core-rules/src/weekly/weekly-alert-stage.spec.ts` +
  `apps/api/test/weekly-overtime-alert.e2e-spec.ts`, 상대값 임계
  (소정+연장한도×95%=31.4h)가 절대값(45h)보다 먼저 도달해 위험(DANGER)
  단계 알림이 나감을 확인
- [x] "월·화 13h, 수·목 6h, 금 8h" 케이스: 한도 위반 알림 없음 + 가산수당
  10h분 산출 — STEP3 기존 테스트(`weekly-limit-violation.spec.ts`/
  `weekly-overtime-pay.spec.ts`)가 이미 검증(46h, 40h초과분 6h→위반
  아님, 일별 8h초과 합산 10h은 가산수당 별도 산정)
- [x] 휴일 8h 포함 주 54h 근로자가 위반 판정 — 같은 파일, 시나리오21
  기존 테스트로 검증됨(신규 코드 없음)
- [x] 동일 주차 동일 단계 알림 1회만 발송 — `weekly-overtime-alert.e2e-spec.ts`,
  같은 (직원,주,단계)로 `evaluateAndNotify()`를 두 번 호출해도 alert_log가
  채널당 1건만 남음을 확인(`NotificationService.notify()`의 기존 dedup
  메커니즘 재사용, targetPeriod에 employeeId를 포함시켜 같은 관리자가
  받는 서로 다른 직원의 알림끼리 오탐 dedup되지 않게 함)
- [x] 3,736명 주간 재계산 5분 이내(SYSTEM 주체로 실행) —
  `apps/api/test/weekly-recalc-batch-performance.e2e-spec.ts`, 실제
  3,741명(기본 픽스처 5명 포함)을 (직원×주) 단위로 팬아웃해 전부
  `attendance_weekly` upsert 완료까지 54.6초(목표 300초의 18% 수준)

부수적으로 확인한 것: `packages/core-rules` 39개 스위트 196개 테스트
전부 통과(커버리지 90%대 유지), `apps/api`/`apps/admin-web` 전체
`tsc --noEmit` 통과, 기존 STEP0~8 e2e 46개 파일 전부 회귀 없음 재확인
(신규 5개 파일 포함 총 50개 파일 137개 테스트 전부 통과 — punches-p95
포함). admin-web에 본사/사업장 대시보드 페이지(`/dashboard`, 역할별
자동 전환, KPI 타일 + 출근률 막대 — 색상만이 아니라 텍스트 태그로
위험 단계 구분)를 추가하고 실제 브라우저로 HQ_HR·SITE_MANAGER 양쪽
계정 로그인 후 렌더링을 확인했다(이 과정에서 `query.isLoading` 가드만
믿고 `query.data!`로 단정한 실버그를 발견해 `!query.data` 가드로 수정).
준법 리포트 4종(미등록/조기출근반복/미승인미판정/야간건강진단) 중 앞
셋은 API만 신규 추가(admin-web UI는 범위 밖 — STEP6.5/7 선례와 동일한
결정), 야간작업 특수건강진단은 배치+조회 API+e2e까지 완료했다. 월/분기
초과근로 통계·사업장별 비교·위반 이력·엑셀 내보내기는
`apps/api/src/modules/compliance-reports/`에 구현·e2e 검증했다.

## STEP 10. 인사 시스템 연동 어댑터 ✅ 완료

> 급여 연동(STEP 11)보다 먼저 수행. 요구사항서 5.2 체크리스트를 인사시스템 담당자에게
> 먼저 확인.

표준 인사정보 스키마 + 어댑터 인터페이스(FileAdapter/DbAdapter/ApiAdapter, 설정
한 줄 전환), SYSTEM 주체 동기화 배치(10% 이상 변경 시 자동 적용 차단), 파견·협력업체
수동 등록, 겸직/복수사업장, 중계(relay) 방식 문서화. 상세 설계는
[`docs/HR_INTEGRATION.md`](docs/HR_INTEGRATION.md) 참고.

핵심 설계 결정: dry-run/run이 조회→정규화→diff 3단계를 공유하고, 실제
배치만 그 뒤(영속화·자동적용/보류)를 더 수행한다(`hr-sync.service.ts`) —
두 경로가 갈라지면 "dry-run엔 안 보이던 변경이 실배치에서 나타나는" 류의
불일치가 생기기 쉬워서다. 어댑터 선택은 순수 함수(`hr-sync-adapter.
selector.ts`)로 분리해 Nest DI 없이도 단위 테스트가 가능하다. 신규
Employee 계정은 임시 비밀번호 해시(`common/auth/temp-credential.util.ts`)로
`EmployeeCredential`을 만들어 `mustChangePassword` 기본값(true)이 첫
로그인 재설정을 강제하게 했다 — 이 STEP이 `EmployeesRepository`/
`EmployeesService` 밖에서 Employee를 처음으로 생성하는 쓰기 경로다.

**완료 조건**
- [x] 세 어댑터 모두 mock 테스트 통과 + 설정 한 줄 전환 —
  `apps/api/src/modules/hr-sync/adapters/*.spec.ts`(FileAdapter는 실제
  임시 EUC-KR/UTF-8 CSV·xlsx 픽스처로), `hr-sync-adapter.selector.spec.ts`
  (`HR_SYNC_ADAPTER_TYPE` 값만 바꿔 구현체가 바뀜을 확인)
- [x] dry-run이 실제 적재 없이 변경 예정 내역 출력 —
  `apps/api/test/hr-sync.e2e-spec.ts`, dry-run 후 대상 Employee/HrSyncBatch
  행이 전혀 생성되지 않았음을 확인
- [x] 15%(테스트에서는 여유 있게 약 19%) 변경 시나리오에서 자동 적용
  차단 + 관리자 확인 요구 — 같은 파일, `HrSyncBatch.status=PENDING_REVIEW`
  로 멈추고 `HR_SYNC_REVIEW_REQUIRED` 알림이 HQ_HR에게 발송됨을 확인,
  승인(`POST .../approve`) 후에만 실제 반영됨까지 검증
- [x] EUC-KR CSV가 깨짐 없이 처리 — 같은 파일 + `csv-encoding.util.spec.ts`,
  `iconv-lite`로 인코딩한 한글 이름/부서가 라운드트립 후 그대로 보존됨을 확인

부수적으로 확인한 것: 신규 단위테스트 35개 + e2e 4개 전부 통과,
`apps/api` 전체 `tsc --noEmit` 통과, 기존 e2e 전체 재실행 회귀 없음
(punches-p95 포함 — hr-sync 큐도 다른 STEP9 큐와 동일하게 obliterate
목록에 추가). admin-web UI는 이번 1차 구현 범위 밖으로 둔다(STEP6.5/7
선례와 동일한 결정) — API·엔진·테스트까지 완결한 뒤, 필요하면 후속으로
진행한다.

**회귀 검증 중 발견·수정한 기존 결함(STEP10과 무관, 전사 배치 인프라 전반)**
- BullMQ 컨슈머 8개(`audit-merkle-seal`/`fraud-detection`/`hr-sync`/
  `no-show-detection`/`notifications`/`recalculation`/`weekly-recalc-batch`/
  `weekly-alert`) 전부 Worker의 `'error'` 이벤트 리스너가 없어, 잡 강제
  삭제(obliterate) 후 lock 갱신 실패가 uncaught exception으로 번질 수
  있었다. 8개 전부에 `@OnWorkerEvent('error')` 로깅 핸들러 추가.
- `apps/api/test/punches-p95.e2e-spec.ts`: 측정 직후 큐 정리에서
  `obliterate({force:true})`가 그 순간 워커가 실제 처리 중이던(active)
  잡까지 강제 삭제해, 해당 워커가 "처리 완료" 상태로 전환하지 못하고
  `afterAll`의 `app.close()`가 무한 대기하는 문제가 있었다(200초 훅
  타임아웃 이후에도 프로세스가 종료되지 않고 남음). obliterate 전에
  각 큐의 active count가 0이 될 때까지 기다리는 `waitForActiveDrain()`
  추가로 해결 — 재검증 결과 25초 내 정상 종료, 에러 로그 0건.

## STEP 11. 급여 마감 및 연동

마감 프로세스(사업장→권역→본사, 배타 잠금+재조회), 급여 산출 항목(임금대장/명세서
기재사항 기준 명명), 레이아웃 2종(월 단위/일 단위 일용), 내보내기 Exporter 추상화,
재마감(버전 기록+차분 리포트), 마감 전 자동 검증.

**완료 조건**
- 미승인 실적 잔존 사업장 마감 차단
- 마감→산출→내보내기→재마감 통합 테스트 통과
- 재마감 차분 리포트가 변경 근로자·항목·차이값 정확히 표시
- 일용직 레이아웃 별도 산출

## STEP 12. 보안 · 성능 · 배포

OWASP Top 10 점검, 위치정보 파기 배치(retention_job 롤, punch_location만 삭제,
audit_log 기록), 위치정보법 부수 의무(확인자료/일시중지/열람정정/철회 파기) 확인,
부하 테스트(피크 분당 500건), Docker/IaC/GitHub Actions, RPO 15분/RTO 4시간,
운영 문서(매뉴얼/런북/파일럿 체크리스트).

**완료 조건**
- 부하 테스트 P95 1초 이내 유지
- 위치정보 파기 배치 정상 실행, punch_raw는 그대로 남음
- 복구 훈련으로 RTO 4시간 이내 검증
- 파일럿 체크리스트 문서 작성

---

## 파일럿 전 반드시 할 것 (부록 B)

1. 실제 사업장 1~2곳의 지난달 근태 데이터로 계산 엔진 결과를 수기 집계와 대사 (목표 99%)
2. 노무사 검토 — 미승인 연장근로 처리, 근로일 귀속, 휴게 처리, 퇴근 미등록 정책,
   단시간 근로자 소정 초과분 규율
3. 법무 검토 — 위치정보 수집·이용 동의 문구, 위치기반서비스사업 신고 대상 여부,
   연차 촉진 통지의 "서면" 요건에 전자적 방법 포함 여부
4. 노사 협의 및 현장 관리자 교육
5. 시행예정 법령 대조 — 2026.8.20 / 2026.10.8 / 2026.12.10 / 2027.1.1 / 2027.6.10
   시행 개정본이 계산 규칙에 영향을 주는지 확인
