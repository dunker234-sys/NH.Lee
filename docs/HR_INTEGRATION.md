# HR_INTEGRATION — STEP 10 인사 시스템 연동 어댑터

`apps/api/src/modules/hr-sync/`(신규). `packages/core-rules`는 변경 없음
(근로시간 법령 계산이 아니라 인사 마스터 동기화이므로 순수 계산 함수를
새로 두지 않는다).

## 1. 왜 이 STEP이 필요했나

STEP1~9는 `Employee`가 이미 존재한다고 가정하고 근태를 계산했다. 실제
운영에서는 사내 자체 개발 인사관리 시스템이 재직/퇴사/소속의 단일 진실
소스이고, 그 인터페이스(파일/DB/REST 중 무엇이 될지)가 이 시스템 개발
시점에 아직 확정되지 않았다. 따라서 "교체 가능한 어댑터 구조"가 이
STEP의 핵심 제약이다 — 실제 인터페이스가 나중에 정해져도 근태 시스템
본체(동기화 엔진)는 표준 스키마만 바라보고, 어댑터 구현체만 새로 추가하면
된다.

## 2. 표준 인사정보 스키마

`apps/api/src/modules/hr-sync/hr-sync.types.ts`의 `StandardHrRecord`가
근태 시스템 본체가 바라보는 유일한 스키마다:

```ts
interface StandardHrRecord {
  employeeNo: string; name: string; siteCode: string;
  department?: string; jobTitle?: string;
  hireDate: string; resignationDate?: string;
  employmentType: string; contractedWorkMinutes?: number;
  managerEmployeeNo?: string; effectiveDate: string; // 이 레코드가 유효한 시점
}
```

어댑터별 원본 컬럼명·포맷 차이는 각 어댑터 내부에서 이 스키마로 흡수한다.
`employmentType`은 어댑터가 원본 문자열 그대로 넘기고,
`hr-sync-normalizer.ts`가 `EmploymentType` enum으로 매핑한다(enum 값
자체와 흔한 한국어 표기를 모두 인식, 실패 시 해당 행만 `ERROR`로 분류—
나머지 행 처리를 막지 않는다).

## 3. 어댑터 3종 + 설정 한 줄 전환

`HR_SOURCE_ADAPTER`(Nest 팩토리 프로바이더, `hr-sync.module.ts`)가
`HR_SYNC_ADAPTER_TYPE` 환경변수 값(`FILE`/`DB`/`API`, 기본값 `FILE`) 한
줄로 구현체를 고른다 — 선택 로직 자체는 순수 함수
`hr-sync-adapter.selector.ts#selectHrSourceAdapter`로 분리해 단위 테스트로
검증한다.

| 어댑터 | 설정 | 구현 |
|---|---|---|
| **FileAdapter** | `HR_SYNC_FILE_PATH`(디렉터리) | 그 디렉터리에서 가장 최근 수정된 `.csv`/`.xlsx` 1개를 읽는다. CSV는 BOM 유무 → 엄격(fatal) UTF-8 디코딩 시도 → 실패 시 EUC-KR(`iconv-lite`)로 자동 판별한다(`adapters/csv-encoding.util.ts`). SFTP/공유폴더가 이 디렉터리에 파일을 미리 내려받아 둔다는 전제 — 실제 전송 프로토콜 구현은 이 STEP의 범위 밖이다(§6 참고). |
| **DbAdapter** | `HR_SYNC_DB_CONNECTION_STRING`(읽기 전용 계정) + `HR_SYNC_DB_QUERY`(컬럼 별칭이 `StandardHrRecord` 필드명과 일치해야 함) | 커넥션(`pg.Pool`)과 쿼리 실행을 `DbQueryRunner` 인터페이스 뒤에 둬 목 테스트 가능. 대상 인사시스템 스키마가 바뀌어도 쿼리 문자열만 고치면 된다. |
| **ApiAdapter** | `HR_SYNC_API_BASE_URL` + `HR_SYNC_API_AUTH_STRATEGY`(`BEARER`\|`OAUTH_CLIENT_CREDENTIALS`) | `GET {baseUrl}/employees?asOfDate=...`. 인증 방식은 `HrApiAuthStrategy` 플러그인(`BearerTokenAuthStrategy`/`OAuthClientCredentialsAuthStrategy`) — 새 인증 방식이 필요하면 이 인터페이스의 구현체만 추가한다. Node 내장 `fetch` 사용(신규 HTTP 클라이언트 의존성 없음). |

## 4. 동기화 엔진

`HrSyncService`(`hr-sync.service.ts`)가 dry-run과 실제 배치(run)가 공유하는
1~3단계를 수행한다: ①어댑터 조회 → ②`hr-sync-normalizer.ts`로 정규화
(사업장코드 미존재/날짜 형식 오류/고용형태 매핑 실패는 행 단위 `ERROR`) →
③`hr-sync-diff.ts`로 현재 재직(ACTIVE/ON_LEAVE) `Employee` 스냅샷과 비교해
`NEW`/`CHANGED`/`DEPARTED` 분류.

- **퇴사 판정 2가지 경로**: 피드에 퇴사일이 새로 채워진 경우, 또는 DB엔
  ACTIVE인데 피드 자체에서 아예 빠진 경우(피드는 "변경분"이 아니라 매번
  전 재직 인원의 스냅샷이라는 전제).
- **최신 수동정정 보호**: `Employee.hrSourceEffectiveDate`가 이번 피드의
  `effectiveDate`보다 최신이면 그 레코드는 건너뛴다(오래된 피드가 최근
  동기화/수동정정을 덮어쓰지 않는다).
- **변경 비율 계산**: `changeRatio = (신규+변경+퇴사) / 현재 재직 인원수`.
  `HrSyncPolicyResolverService`가 `policy_config`의
  `hrSyncAutoApplyChangeRatioThreshold`(기본 0.10, 시드:
  `prisma/seed-hr-sync-policy.ts`)를 읽는다 — 법령 수치는 아니지만
  지오펜스 반경 등 기존 운영 임계값과 동일하게 코드에 상수화하지 않는다
  (CLAUDE.md 절대 규칙4).
- **`HrSyncBatch`/`HrSyncBatchRow`는 dry-run 여부와 무관하게 실제 배치
  (run)에서는 항상 먼저 저장된다** — 리포트(대상/신규/변경/퇴사/오류
  건수 + 행단위 사유)의 유일한 근거다. dry-run은 이 저장을 건너뛰고
  미리보기만 반환한다(완료조건: "dry-run 모드가 실제 적재 없이 변경
  예정 내역을 출력").
- **임계값 이상이면 `PENDING_REVIEW`로 멈추고 `HrSyncApplyService.
  applyBatch()`를 호출하지 않는다** — HQ_HR/ADMIN 전원에게
  `HR_SYNC_REVIEW_REQUIRED` 알림(urgent, PUSH+EMAIL+IN_APP)을 보낸다.
  관리자가 `POST /admin/hr-sync/batches/:id/approve`로 승인해야 실제
  반영되고(`status=APPLIED`), `reject`로 기각하면 영구히 미적용 상태로
  남는다(재실행은 다음 배치 사이클 몫).
- **임계값 미만이면 즉시 `applyBatch()`가 호출된다**(`status=AUTO_APPLIED`).

`HrSyncApplyService`가 실제 `Employee` 테이블에 반영한다:
- **신규**: `Employee` 생성(+`EmployeeSiteAssignment` PRIMARY 1건) + 임시
  비밀번호 해시로 `EmployeeCredential` 생성(`mustChangePassword=true` 기본값
  — 첫 로그인 시 재설정 강제, `common/auth/temp-credential.util.ts`).
- **변경**: 필드 갱신. 사업장 코드가 바뀌면 기존 PRIMARY 배정을
  `endDate`로 마감하고 새 PRIMARY 배정을 만든다 — **SECONDARY(겸직)
  배정은 건드리지 않는다**(요구사항서 5장⑤, blast radius 최소화).
- **퇴사**: `status=RESIGNED`+`resignationDate` 반영. **삭제하지 않는다**
  (데이터 보존).
- **상위 결재자(managerId) 2-pass 해결**: 같은 배치 안에서 신규 직원이
  다른 신규 직원의 상위 결재자일 수 있어, 1차로 전원 생성/갱신한 뒤
  2차로 `employeeNo → id` 매핑을 다시 조회해 `managerId`를 채운다.

## 5. 파견·협력업체 인력

인사시스템에 없는 인력은 `PartnerCompany`(협력사 코드) + `Employee.
partnerCompanyId`로 표현한다(`apps/api/src/modules/hr-sync/partner/`):
- `POST /admin/partner-companies` 등 HQ_HR/ADMIN 전용 CRUD.
- `POST /admin/partner-companies/:id/employees`(수동 1건) /
  `POST /admin/partner-companies/:id/employees/excel`(엑셀 일괄, 기존
  마이그레이션 모듈과 동일하게 `exceljs`로 서버에서만 파싱, 행 단위
  오류는 전체를 막지 않고 모아서 반환).
- **"협력사 담당자는 자사 인력만 조회"**: `org-scope-resolver.service.ts`
  (사업장 축)를 확장하지 않고, `GET /me/partner/employees`라는 별도의
  좁은 셀프서비스 엔드포인트를 신설했다 — 호출자 자신의
  `partnerCompanyId`로만 필터링한다(STEP5-A `/me/*` 선례와 동일 원칙).

## 6. 겸직·복수사업장

`EmployeeSiteAssignment`(PRIMARY/SECONDARY)는 STEP1부터 이미 존재한다.
동기화 엔진은 인사이동 반영 시 **PRIMARY 배정만** 다루고 SECONDARY는
전혀 건드리지 않는다 — 부(副) 소속 관리는 이 STEP 이전과 동일하게
별도 화면/API 몫이다.

## 7. 사내망 접근이 제한될 경우의 중계(relay) 방식

인사시스템이 사내망 안에만 있어 근태 시스템(클라우드)이 직접 접근할 수
없는 경우, 아래 3가지 중 하나를 택한다. 코드는 어떤 방식이든
FileAdapter/DbAdapter/ApiAdapter 셋 중 하나로 흡수되도록 설계했으므로,
방식이 바뀌어도 근태 시스템 쪽 코드 변경은 최소화된다.

| 방식 | 개요 | 적합한 경우 | 트레이드오프 |
|---|---|---|---|
| **A. 릴레이 에이전트가 파일 푸시** | 고객 인트라넷 안에 설치된 경량 에이전트가 인사시스템에서 주기적으로 추출한 CSV/XLSX를 근태 시스템이 접근 가능한 위치(SFTP/오브젝트 스토리지)로 푸시 → FileAdapter가 그 위치를 읽는다. | 인사시스템 DB/API를 외부에 직접 노출하고 싶지 않을 때. 구현이 가장 단순. | 배치 주기(보통 야간 1회)만큼 지연 발생. 에이전트 자체의 배포·모니터링이 별도 운영 부담. |
| **B. 온프레미스 스케줄러가 DB를 조회해 API로 전송** | 고객 인트라넷 안의 스케줄러(cron 등)가 DbAdapter와 동일한 쿼리를 직접 실행해 표준 스키마로 정규화한 JSON을 근태 시스템의 ApiAdapter 수신 엔드포인트로 POST. | DB 커넥션을 외부에 노출할 수 없지만 아웃바운드 HTTPS는 허용될 때. | 정규화 로직이 온프레미스 스크립트와 근태 시스템 양쪽에 나뉘어 존재 — 스키마 변경 시 두 곳을 함께 고쳐야 한다. |
| **C. 운영팀 수동 VPN 다운로드 + 감시 폴더 배치** | 운영팀이 VPN으로 인사시스템에 접속해 암호화된 추출 파일을 수동으로 내려받아 FileAdapter 감시 폴더에 배치. | 자동화 파이프라인 구축 전 파일럿 단계, 또는 연동 빈도가 매우 낮을 때(월 1회 등). | 사람이 개입하므로 지연·누락 위험이 가장 크다 — 10% 자동적용 차단 안전장치가 이 방식에서 특히 중요하다(수동 추출 실수가 그대로 대량 변경으로 반영될 수 있어서). |

세 방식 모두 "근태 시스템이 인사시스템에 능동적으로 접근하지 않는다"는
공통점이 있다 — 방식 A/C는 FileAdapter, 방식 B는 ApiAdapter(수신 전용
엔드포인트를 그 위에 별도로 얹어야 함, 이 STEP 1차 구현 범위 밖)로
흡수된다.

## 8. 이번 STEP에서 하지 않은 것 (범위 밖)

- admin-web UI(배치 이력·승인 화면)는 이번 1차 구현 범위 밖이다(STEP6.5/
  STEP7 선례와 동일한 결정) — API·엔진·테스트까지 완결한 뒤 필요하면
  후속으로 진행한다.
- 방식 B(온프레미스 스케줄러 → API 수신)의 수신 전용 엔드포인트는
  설계만 문서화했고 구현하지 않았다 — 기존 ApiAdapter는 "근태 시스템이
  인사시스템 API를 호출"하는 방향이라 방향이 반대다.
- 실제 SFTP 전송 프로토콜 구현은 범위 밖이다 — FileAdapter는 "이미
  내려받아진 로컬 디렉터리"를 읽을 뿐이다.

## 9. 테스트

- 단위: `hr-sync-normalizer.spec.ts`, `hr-sync-diff.spec.ts`,
  `hr-sync-adapter.selector.spec.ts`, 어댑터 3종 각각(`adapters/*.spec.ts`,
  FileAdapter는 실제 임시 EUC-KR/UTF-8 CSV·xlsx 픽스처 파일로 검증),
  `csv-encoding.util.spec.ts`/`csv-parse.util.spec.ts`.
- e2e: `test/hr-sync.e2e-spec.ts` — dry-run 무적재, 변경비율 10% 미만
  자동적용, 20%(15% 이상) 시나리오에서 자동적용 차단+알림 발송+승인 후
  실제 반영, EUC-KR CSV 한글 깨짐 없는 처리.
