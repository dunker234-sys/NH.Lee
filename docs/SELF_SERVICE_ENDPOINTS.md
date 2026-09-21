# SELF_SERVICE_ENDPOINTS — STEP 5-A 백엔드 컴패니언

STEP 5-A(근로자 모바일 앱) 계획 수립 중 확인된 갭 4종을 메운다: 화면 8(알림)·
9(개인정보)·타각 사업장 선택이 필요로 하지만 이전 STEP까지는 존재하지 않던
self-service 읽기/쓰기 엔드포인트. `apps/api/src/modules/{sites,consent}/`,
`apps/api/src/modules/notifications/alert-log.controller.ts`. 전부 STEP1/4/4.5가
이미 심어 둔 Prisma 모델 위에 얹었을 뿐 — 이번 STEP에 스키마 마이그레이션은 없다.

## 1. 공통 원칙

`device-token.controller.ts`가 확립한 패턴을 그대로 따른다: `@CurrentPrincipal()`
에서 employeeId를 가져오고 요청 바디의 employeeId는 신뢰하지 않는다(전부
self-scoped, org-scope 가드 불필요 — 항상 본인 레코드만). 응답은 narrow
projection(`punches.controller.ts`처럼 내부 필드는 절대 echo하지 않는다).

## 2. `GET /sites`, `GET /sites/:id`

`apps/api/src/modules/sites/`. `/sites`는 호출자의 활성
`EmployeeSiteAssignment`(`endDate IS NULL OR endDate >= 오늘`)만 반환한다 —
헤드카운트 캐시, QR TOTP 시크릿 등 관리자 전용 필드는 노출하지 않는다.
`/sites/:id`는 활성 배정으로 제한하지 않는다 — 파견·외근으로 본인 배정에
없는 siteId를 이름으로 해석해야 하는 경우가 있기 때문이다(사업장 이름·좌표는
민감정보가 아니라는 판단).

## 3. `Consent`(위치정보 수집 동의) CRUD

`apps/api/src/modules/consent/`. 기존 `notification-consent.service.ts`에
얹지 않고 별도 모듈로 뒀다 — `NOTIFICATION` 동의는 옵트아웃 기본(레코드
없음=수신 동의)인데 `LOCATION_COLLECTION`은 옵트인 기본(레코드 없음=미동의)
이라 기본정책이 반대인 두 개념을 한 서비스에 섞지 않는다.

- `GET /consent/policy?type=LOCATION_COLLECTION` — 동의 화면이 표시할 법정
  고지 항목. `retentionDays`는 `location_retention_days`(punch-policy가 이미
  정의한 키, `PunchPolicyResolverService`와 값 출처를 공유)를, `policyVersion`은
  새 키 `location_consent_policy_version`(`consent-policy-defaults.ts`)을
  `ConsentPolicyResolverService`(`common/policy/`)가 함께 읽는다.
  `PunchPolicyResolverService`와 달리 siteId를 필수로 요구하지 않는다 —
  동의는 사업장에 묶인 개념이 아니다(`NotificationPolicyResolverService`와
  동일한 이유로 `siteId: string | null`).
- `GET /consent?type=LOCATION_COLLECTION` — `{current, history}`. `current`는
  최신 행, `history`는 전체 이력.
- `POST /consent` — 최초 동의 또는 일시중지 후 재개. Body는
  `{consentType:'LOCATION_COLLECTION'}`뿐이다 — `policyVersion`은 클라이언트가
  보낼 수 있는 필드 자체가 DTO에 없다(전역 `forbidNonWhitelisted`가 여분
  필드를 400으로 거부) — 서버가 `ConsentPolicyResolverService`로 해석한 값만
  저장된다(CLAUDE.md 절대 규칙 4).
- `POST /consent/location/pause` — 위치정보법 §24②. 일시중지 행위 자체를
  새 `Consent(PAUSED)` 행으로 기록한다.
- `POST /consent/location/withdraw` — 위치정보법 §24④. 새 `Consent(WITHDRAWN)`
  행을 기록한다.

**설계상 update 없음, 매번 INSERT**: 상태 전이마다 기존 행을 덮어쓰지 않고
새 행을 추가한다 — "언제 멈추고 언제 재개했는지"가 §24② 이력 요건의 핵심이라,
기존 행을 갱신하면 그 이력이 사라진다.

**알려진 갭 — §24④ "지체없는 파기" 미구현**: `withdraw()`는 `Consent` 이력만
기록하고 `PunchLocation` 실제 삭제는 하지 않는다.
`PunchLocationRepository`(`common/punch/punch-location.repository.ts`) 자체
주석이 이미 "위치정보는 파기 배치(retention_job 롤)가 별도로 DELETE하며,
그 외 경로는 수정하지 않는다"고 명시하고 있어, 이 경계를 존중해 consent
모듈에서 직접 DELETE/UPDATE하지 않기로 했다 — 그런데 그 파기 배치 자체가
이 저장소 어디에도 아직 구현되지 않았다(어떤 STEP도 만든 적 없음). 결과적으로
철회해도 `PunchLocation` 행은 `purgeScheduledAt`이 될 때까지(기본 30일)
남아 있는다. "지체없는 파기"를 문자 그대로 만족하려면 별도 즉시파기
배치/서비스가 필요하며, 이는 법적 판단이 필요한 별도 작업으로 남겨둔다.

## 4. `GET /location-access-log` (위치정보법 §16조②/§24조③)

`apps/api/src/modules/consent/location-access-log.{controller,repository}.ts`.
`before`/`limit` 커서 페이지네이션(`common/dto/cursor-page-query.dto.ts`,
`GET /alert-log`와 공유).

**더 큰 알려진 갭**: `LocationAccessLog`에 실제로 쓰는 코드가 이 저장소
어디에도 없다 — 관리자·시스템이 위치를 조회하는 지점(현재 그런 조회
엔드포인트 자체가 없음)을 계측하는 별도 작업이 필요하다. 이번 STEP은 읽기
엔드포인트만 만들었고, 실사용 전까지는 항상 빈 목록을 반환한다.

## 5. `GET /alert-log`

기존 `apps/api/src/modules/notifications/`에 `alert-log.controller.ts`만
추가했다(새 모듈 아님 — `AlertLogRepository`가 이미 존재하는 확장 대상).
`AlertLogRepository.findByRecipient()`가 `@@index([recipientEmployeeId,
requestedAt])`를 그대로 쓴다.

**알려진 갭**: `no-show-detection`/`fraud-detection` 모듈 중 실제로
`NotificationService.notify()`를 호출하는 프로듀서 코드가 아직 없다
(`DUMMY_TEST`/`DUMMY_URGENT_TEST`만 존재) — 52시간 경고·승인결과·타각누락
같은 실제 알림 타입은 STEP6~9가 만든다. 이 엔드포인트는 실제로 동작하지만
그 전까지는 데이터가 비어 있거나 더미뿐이다.

## 6. 검증

`apps/api/test/{sites,consent,alert-log,location-access-log}.e2e-spec.ts` —
기존 관례(실제 Postgres+Redis, `resetDatabase()`+`loadFixture()`, mock 없음)를
그대로 따른다. `alert-log.e2e-spec.ts`는 BullMQ 큐를 경유하므로
`punches-p95.e2e-spec.ts`와 같은 이유로 단독 실행을 권장(다른 큐-경유 스펙과
같은 프로세스에서 `--runInBand`해도 문제없음을 확인했지만, 대량 부하 테스트와
묶으면 기존에 문서화된 teardown 이슈가 재현될 수 있다).
