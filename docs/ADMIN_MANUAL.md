# ADMIN_MANUAL — 관리자(사업장/권역/본사) 운영 매뉴얼

STEP12 운영 문서. 역할별로 실제 존재하는 화면(관리자 웹 API 엔드포인트) 기준으로
정리한다 — admin-web UI는 STEP6.5~11에서 이번 1차 구현 범위 밖으로 확정되었으므로
(`ROADMAP.md` 참고), 이 매뉴얼은 API를 직접 호출하는 관리 도구/향후 UI 구현자를
위한 "화면이 곧 만들어질 API 계약" 기준으로 작성한다.

## 1. 역할과 조직 스코프

`docs/AUTH_RBAC.md`가 상세를 다룬다. 이 매뉴얼에서 반복 등장하는 역할만 요약:

| 역할 | 스코프 | 이 매뉴얼에서 주로 하는 일 |
|---|---|---|
| `SITE_MANAGER` | 소속 사업장 1곳 | 근태 승인, 정정 승인, 마감 1단계 제출 |
| `REGION_MANAGER` | 소속 권역 내 여러 사업장 | 마감 2단계(권역) 승인, 사업장 간 비교 |
| `HQ_HR` | 전사 | 전 기능 접근, 직권 정정, 마감 3단계(본사) 확정, 보호상태 관리, 파기 배치 확인 |
| `ADMIN` | 전사(시스템 관리) | HQ_HR과 동일 스코프 + 운영 모니터링, 키오스크 기기 등록 |

## 2. 일상 운영 — 근태 확인·승인

- **미승인 실적 검토**: `GET /admin/approval/overtime-requests`(사전 신청 있는
  연장) 외에, 신청 없이 발생한 `UNAPPROVED_ACTUAL` 실적은 `GET
  /admin/dashboard`의 검토 큐 위젯에서 확인한다. 반드시 사유와 함께 판정하며
  (`POST /admin/approval/work-not-provided-judgments`), 판정 없이는 실근로
  시간이 0으로 계산되지 않는다(CLAUDE.md 절대 규칙 2 — 판정은 계산 엔진이
  아니라 관리자의 사후 확인 절차).
- **조기 출근**: `admin/approval/early-clock-in` — 사전 승인 없이 조기 출근한
  실적을 사후 승인/반려한다.
- **외근·출장·지원**: `admin/approval/dispatch-requests` — 승인 시 해당 기간
  지오펜스 예외가 자동 적용된다.
- **정정 신청**: `admin/correction/requests` — 근로자가 낸 `correction_request`
  승인/반려. **직권 정정**(`admin/correction/admin-direct`)은 `HQ_HR`만 가능하고
  사유가 필수다 — 원본 타각을 고치는 것이 아니라 별도 보정 레코드를 추가하는
  방식이다(CLAUDE.md 절대 규칙 1).

## 3. 스케줄·연차·보상휴가

- 교대 패턴/스케줄: `admin/schedule/shift-templates`, `admin/schedule/schedules`,
  자동 배정은 `admin/schedule/rosters`, 엑셀 일괄 업로드는
  `admin/schedule/excel`.
- 연차: `admin/leave/types`(종류 정의), `admin/leave/accrual`(발생 배치 확인),
  `admin/leave/promotion`+`admin/leave/promotion-policy`(연차 촉진 통지),
  개별 신청 승인은 `admin/leave/requests`.
- 보상휴가: `admin/leave/compensatory` — 근로자대표 서면합의(`labor_agreement`)
  가 선행 등록되어 있어야 제도 자체가 활성화된다.

## 4. 급여 마감 (STEP11)

3단계 파이프라인 — `POST /admin/payroll-close/:siteId/:yearMonth/submit`
(사업장) → 권역 승인 → `finalize`(본사, `HQ_HR`만). 마감 전 자동 검증은
`admin/payroll-close/:siteId/:yearMonth/validation`에서 미리 확인할 수 있다
(미승인 실적 잔존 등은 `submit` 자체를 `PAYROLL_CLOSE_BLOCKED`로 거부한다).
확정 후 내보내기는 `admin/payroll-close/:siteId/:yearMonth/export`(월 단위/
일 단위 레이아웃, Excel/CSV). 재마감이 필요하면 `reopen` 후 정정을 반영하고
같은 파이프라인을 다시 밟으며, 변경분은 `.../diff`에서 차분 리포트로 확인한다
— 재마감은 "예외"가 아니라 정규 절차이므로 반드시 diff를 검토하고 사유를
남긴다.

## 5. 개인정보·위치정보 관리 (STEP12 §A)

- **보호상태**(임신 등): `HQ_HR`만 등록/조회 가능. `EmployeeProtectedStatus.
  statusType`은 `PII_ENCRYPTION_KEY`로 암호화 저장되며, 조회 시 애플리케이션이
  복호화해 응답한다 — DB를 직접 열어봐도 평문이 보이지 않는 것이 정상이다.
- **위치정보 열람**: 근로자 본인은 `GET /location-access-log`로 자신의 위치
  데이터가 언제 왜 조회됐는지 열람할 수 있다(위치정보법 §24③).
- **위치정보 동의 관리**: `consent` 엔드포인트로 일시중지/철회를 처리한다.
  **철회 시 지체 없이** 해당 직원의 `punch_location`만 별도 즉시-파기 큐로
  삭제된다(§24④) — `punch_raw`(근태 원본)는 그대로 남는다.
- **정기 파기 배치**: 매일 03:00 KST, `retention_job` 전용 DB 롤(구조적으로
  `punch_raw`를 UPDATE/DELETE 할 수 없는 최소권한 계정)이 보존기간이 지난
  `punch_location`만 삭제한다. 실행 결과는 `admin/audit`(감사 로그)에서
  `PUNCH_LOCATION_PURGED` 이벤트로 확인 — 건수·기간·실행자가 1건으로 기록된다.
  **이 배치가 실패하거나 건너뛰면 즉시 조사한다**(`docs/INCIDENT_RUNBOOK.md`
  §위치정보 파기 배치 실패 참고) — 법정 의무 배치다.

## 6. 인사 연동 (STEP10)

`admin/hr-sync` — dry-run으로 미리보기 후 실제 배치 실행. 변경 비율이
`policy_config`의 임계값(기본 10%)을 넘으면 `PENDING_REVIEW`로 멈추고
HQ_HR/ADMIN 전원에게 긴급 알림이 간다 — 이때는 반드시 배치 내역
(`admin/hr-sync`의 batch 상세, 신규/변경/퇴사/오류 건수)을 검토한 뒤 승인한다.
평소보다 변경 인원이 많다면(대량 입사/퇴사 이벤트가 아닌 한) 원본 인사
데이터 오류를 먼저 의심한다.

## 7. 운영 모니터링 (STEP12 §B5)

`GET /admin/ops/monitoring`(`HQ_HR`/`ADMIN`) — 6개 지표를 한 화면에서 확인:
타각 실패율, 미등록 건수, 미승인 실적 미판정 건수, 배치(재계산/주간/월간)
성공률, 알림 발송 성공률, DLQ(실패 작업) 적체. 지표별 임계 초과 시 대응
절차는 `docs/INCIDENT_RUNBOOK.md`를 따른다. 본 엔드포인트는 실 관측 플랫폼
(Prometheus 등) 도입 전까지의 경량 대체 수단이다.

## 8. 키오스크·사업장 인증 관리

`admin/kiosk-devices` — 사업장별 공용 태블릿 등록/폐기(기기 자격증명 발급,
직원 신뢰(`device_binding`)와는 별개 축). 사업장 인증 신호(NFC/Wi-Fi
BSSID 등)는 `sites` 엔드포인트에서 함께 관리한다.

## 9. 컴플라이언스 리포트

`admin/compliance-reports` — 주 52시간 초과 위험, 5인 미만 사업장 법 적용
경계 등. 야간작업 특수건강진단 대상자(근기법 야간 22~06시와 판정 시간대가
다른 산안법 기준, 00~05시 등)는 별도
`admin/compliance-reports/night-work-health-checkup`에서 확인한다.

## 10. 마이그레이션(개시 데이터 이관, 신규 사업장 전환)

`admin/migration/excel`(엑셀 일괄 업로드), `admin/migration/cutover`(사업장별
전환 실행), `admin/migration/cutover/readiness`(전환 전 준비상태 점검). 이관된
데이터는 `source='MIGRATION'`으로 표시되며 `punch_raw`에는 들어가지 않는다.
