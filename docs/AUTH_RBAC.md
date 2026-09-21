# 인증 · 권한 (RBAC + 조직 스코프) — STEP 2

`apps/api/src`의 실제 구현을 요약한다. 상세 설계 근거는 이 STEP 착수 시
Plan 서브에이전트 리뷰를 거쳐 확정한 계획(대화 로그 참고)에 있으며, 이 문서는
구현 후 상태를 기준으로 다시 정리한 참조 문서다.

## Principal과 인가 정보의 신뢰 경계

- `request.tokenClaims` — JWT에서 그대로 디코딩한 값(`sub`, `employeeNo`,
  `deviceId`, `deviceTrust`). **신뢰하지 않는다.**
- `request.principal` / `request.orgScope` — `PrincipalGuard`가 매 요청마다
  `Employee`(+ 활성 `EmployeeSiteAssignment`)를 DB에서 새로 읽어 만드는
  **권위 있는 값**. 인가 판단은 이것만 쓴다.

JWT에 role/scope를 실어 캐시하지 않은 이유: 액세스 토큰 TTL(15분)보다 리프레시
토큰 수명(14일)이 훨씬 길어서, 그 사이 권한이 바뀌어도(퇴사, 인사이동) 캐시된
값이 계속 유효하게 되는 위험이 있다. 3,736명 규모에서 PK 조회 1회는 비용이
무시할 만하다.

## 가드 실행 순서

`JwtAuthGuard`(토큰 서명·만료 검증) → `PrincipalGuard`(DB 재조회로
principal/orgScope 계산, `mustChangePassword` 게이트) → `RolesGuard`(역할
게이트). `@Public()`으로 셋 다 우회, `@AllowWhilePasswordChangeRequired()`로
비밀번호 변경 강제만 우회.

## 조직 스코프

`OrgScope = { kind: 'ALL' } | { kind: 'SITES', siteIds: string[] }`

| 역할 | 스코프 |
|---|---|
| ADMIN, HQ_HR | `ALL` |
| REGIONAL | 자신이 배정된 사업장이 속한 권역(region)의 전 사업장 |
| SITE_MANAGER, EMPLOYEE, PARTNER | `EmployeeSiteAssignment`에서 오늘(KST) 기준 유효한 배정 사업장 |

계산 소스는 `EmployeeSiteAssignment`뿐이다. `Employee.primarySiteId`는 표시용
비정규화 컬럼이라 스코프 계산에 쓰지 않는다.

**두 개의 검증 헬퍼**(`src/common/scope/scope.util.ts`):
- `assertScope(scope)` — scope가 없으면(undefined/null) `OrgScopeRequiredError`
  (500) — 가드를 거치지 않은 호출(버그)을 잡는 마지막 방어선.
- `assertSiteInScope(scope, siteId)` — scope는 있지만 대상이 범위 밖이면
  `OrgScopeDeniedError`(403, `ORG_SCOPE_DENIED`).

## SYSTEM 주체

`src/common/principal/system-context.service.ts`의 `runAsSystem(resourceType, fn, jobId?)`가
유일한 통로다. HTTP 요청에서는 절대 만들어지지 않는다. 실행 전에 `audit_log`에
`eventType='SCOPE_BYPASS', scopeBypassed=true, jobId`를 1건 남긴다(잡 단위로
한 번 — 리포지토리 호출마다 찍지 않는다). STEP 3.5의 RecalculationService 등
후속 배치가 그대로 재사용하는 패턴이다.

## 기기 신뢰 (device binding)

`DeviceBindingService`(`src/modules/auth/device-binding.service.ts`): 직원의
첫 로그인 기기는 advisory lock(`pg_advisory_xact_lock(hashtext(employeeId))`)
아래에서 자동 `trusted=true`, 이후 새 기기는 `trusted=false`로 등록되지만
**로그인은 절대 차단하지 않는다.** `trusted=false` 목록 자체가 검토 큐다(별도
테이블 없음).

`resolveVerificationLevel(deviceTrusted)`(`src/common/punch/verification-level.util.ts`)가
이 값을 `punch_raw.verification_level`(NORMAL/LOW)로 잇는다. 실제
`POST /punches`는 STEP 4의 몫이라 이번 STEP에서는
`PunchRawRepository.create()`로 직접 흘려보내는 통합 테스트로 이 흐름을
검증했다(`test/punch-verification-level.e2e-spec.ts`).

## 리프레시 토큰

SHA-256으로 해시해 저장한다(bcrypt 아님 — 이미 고엔트로피 랜덤값이라 느린
해시가 불필요하고, 유니크 인덱스로 직접 조회해야 한다). 회전 체인
(`replacedByTokenId`)으로 재사용을 탐지한다: 이미 폐기된 토큰이 다시 제출되면
탈취로 간주해 해당 직원·기기의 전체 체인을 무효화하고 `TOKEN_REUSE_DETECTED`를
`audit_log`에 남긴다.

## 잠금 · 비밀번호 정책

`MAX_FAILED_LOGIN_ATTEMPTS`(기본 5), `LOCKOUT_DURATION_MINUTES`(기본 15),
`PASSWORD_MIN_LENGTH`(기본 10, 영문/숫자/특수문자 중 2종 이상)는 환경변수다.
`policy_config`에 넣지 않는다 — CLAUDE.md 절대 규칙 4의 "법령 수치"는 근로기준법
등 노동관계법령 수치를 말하며 보안 정책과는 성격이 다르다. 실패 카운트 증가는
`increment` 원자 연산으로 동시 시도 경합을 막는다.

## 표준 에러 응답

```json
{ "statusCode": 403, "code": "ORG_SCOPE_DENIED", "message": "...", "details": null, "timestamp": "...", "path": "/employees" }
```

`AllExceptionsFilter`(`src/common/filters/all-exceptions.filter.ts`)가 만든다.
401/403/`ORG_SCOPE_REQUIRED`는 `access_log`에 `result=DENIED`로도 남긴다 —
가드가 던진 예외는 인터셉터를 거치지 않으므로(Nest 파이프라인: 가드 →
인터셉터 → 핸들러) 이 필터가 유일한 기록 지점이다. 성공 경로는
`AccessLogInterceptor`가 `result=SUCCESS`로 남긴다.

## `audit_log` 해시 체인

`AuditLogService.write()`(`src/common/audit/audit-log.service.ts`)가
advisory lock으로 삽입을 직렬화하고 `prevHash`(직전 행의 `recordHash`)를 조회해
`recordHash = sha256(canonicalJson({...payload, prevHash}))`로 채운다. STEP 8의
"1시간 Merkle 루트 봉인"·"동시성 100건 무결성"까지는 이번 STEP 범위가 아니지만,
체인 자체는 이미 진짜 값으로 채워져 있어 STEP 8은 이 서비스를 내부적으로
강화하기만 하면 된다(호출부 변경 불필요).

## `punch_raw` 불변성 — 두 계층에서 독립적으로 강제

1. **DB 롤 권한**(STEP 1): `app_rw`에서 `punch_raw`의 UPDATE/DELETE를 회수.
   앱은 항상 `app_rw`로 연결하므로 애플리케이션 레벨 역할(ADMIN 포함)과
   무관하게 동일하게 적용된다.
2. **코드 표면적**(STEP 2): `PunchRawRepository`(`src/common/punch/punch-raw.repository.ts`)에
   `create`/`findMany`만 있고 update/delete 메서드 자체가 없다.

두 계층 모두 테스트로 확인했다(`punch-raw.repository.spec.ts`,
`punch-raw-immutability.e2e-spec.ts`).

## 알려진 갭 (후속 STEP)

- PARTNER는 SITE_MANAGER와 동일하게 사업장 단위로 스코프를 잡는다. 진짜
  협력사 단위 스코프는 `partner_company` 테이블이 생기는 STEP 10 이후.
- `POST /punches` 실제 엔드포인트(지오펜스, 멱등키, 오프라인 큐)는 STEP 4.
- `audit_log` Merkle 루트 봉인, 동시성 100건 무결성 검증은 STEP 8.

## 로컬 검증 방법

```bash
# 유닛 테스트
pnpm --filter @attendance/api test

# e2e 테스트 (attendance_test DB 필요 — 최초 1회만 준비)
psql -U postgres -h localhost -f apps/api/test/setup/create-test-db.sql
DATABASE_URL="postgresql://migrator:migrator_dev_password@localhost:5432/attendance_test" \
  pnpm --filter @attendance/api exec prisma migrate deploy
psql -U postgres -h localhost -d attendance_test -f apps/api/prisma/roles_post_migrate.sql

pnpm --filter @attendance/api test:e2e
```

STEP 2 완료 시점에 위 순서를 실제로 실행해 유닛 8건·e2e 18건 전부 통과를
확인했다.
