# MIGRATION_CUTOVER — STEP 7.5 개시 데이터 이관

`apps/api/src/modules/migration/`(신규) + `apps/admin-web/app/(authenticated)/
migration/`(신규). `packages/core-rules`는 변경 없음(법령 계산이 아니라
데이터 적재·대사이므로 순수 함수를 새로 두지 않는다).

## 1. 왜 이 STEP이 필요했나

STEP1~7이 만들어둔 `LeaveBalance`/`LeavePromotionLog`/`ShiftTemplate`/
`Schedule`/`AttendanceDaily`/`AttendanceMonthly`는 전부 "이 시스템이 개통된
이후"의 실적을 담는 그릇이다. 실제 파일럿에서는 개통 이전 과거 데이터
(연차 잔액, 촉진 이력, 마감 완료 월, 기존 스케줄)가 존재하고, 이를 채워
넣지 않으면 근속 7년 직원의 연차가 "발생18일-사용0일=18일"로 잘못
표시된다(실제는 이미 사용해 7일일 수 있다). 이 STEP은 그 개시 데이터를
Excel로 받아 dry-run 검증 후 적재하고, 사업장별 근로자 단위 대사(수기
집계 대 이관 결과)가 0이 될 때까지 개통 승인을 시스템이 차단하는 도구를
만든다.

## 2. 핵심 설계 결정

- **`LeaveBalance.source`에 이미 `MIGRATION` 값이 있었다**(STEP7이 미리
  심어둠) — 연차잔액 이관에 스키마 변경이 필요 없었다.
- **★ `RecalculationService.assertPayrollOpen()`이 이미 `PayrollClose.
  status`로 재계산을 막는다.** 마감 완료 과거월을 이관할 때 대응하는
  `PayrollClose{status:'CLOSED'}` 행을 함께 만들기만 하면, 이관된
  `AttendanceDaily`/`AttendanceMonthly`는 **기존 메커니즘으로 재계산
  클로버링이 자동 방지**된다 — `RecalculationConsumer`/`RecalculationService`
  코드를 전혀 건드리지 않았다(`test/migration-payroll-close-protection.
  e2e-spec.ts`로 직접 증명).
- **엑셀 dry-run/commit은 `schedule-excel.service.ts`(STEP6)의 2단계
  패턴을 그대로 복제**했다 — 파싱→행단위 검증→(오류 있으면 즉시 반환,
  아무것도 적재 안 함)→commitToken 발급(in-memory Map, 60분 TTL, 단일
  인스턴스 가정의 알려진 한계)→별도 commit 호출로 실제 적재.
- **`AttendanceDaily`/`AttendanceMonthly`에는 `source` 컬럼이 없어서
  신규 추가**했다(`AttendanceRecordSource{CALCULATED MIGRATION}`,
  `LeaveBalanceSource`와 같은 어휘).
- **`SiteCutover`(개통 상태)를 `Site`에 플래그로 얹지 않고 별도
  테이블로 뒀다** — `SiteHeadcountHistory`/`LeavePromotionLog`처럼 이력·
  상태를 별도 테이블에 두는 기존 컨벤션을 따랐다. `cutoverDate`는 법령
  수치가 아닌 사업장별 운영 일자라 `policy_config`가 아니라 이 테이블의
  컬럼이다(CLAUDE.md 절대 규칙4는 법령 수치·임계값에 적용되는 규칙).
- **대사(reconciliation) 지표는 결정적인 고정 2종으로 범위를 좁혔다**
  (자유 텍스트 지표 대신): `ANNUAL_LEAVE_REMAINING_DAYS`(이관된 ANNUAL
  `LeaveBalance` 합: 발생+이월-사용-소멸), `ATTENDANCE_MONTHLY_ACTUAL_
  MINUTES`(이관된 `AttendanceMonthly.totals.actualWorkMinutes` 합). 사용자
  프롬프트의 "18일 vs 7일" 예시를 그대로 재현·테스트할 수 있다.
- **연차촉진이력은 항상 `procedureType:'ARTICLE_61_1'`로만 이관한다** —
  `leave-promotion-compliance.service.ts`를 직접 읽어 확인: 그 서비스는
  `basis.reasonCode==='MONTHLY_ACCRUAL'`이 아닌 잔액(이관 데이터 포함)을
  의도적으로 §61①로 기본 판정한다(그 파일 주석: "더 넓은 절차가 근로자에게
  유리한 방향"). ARTICLE_61_2로 이관해봐야 실제 판정 로직이 그 절차로
  읽지 않으므로, 애초에 그 선택지를 주지 않는다.
- **감사 기록은 행 단위가 아니라 커밋 배치 단위로 1건**만 남긴다
  (`MIGRATION_COMMIT`) — `AuditLogService.write()`가 advisory lock+prevHash
  조회로 완전 직렬화되는 경로라, 수백~수천 행마다 감사 기록하면 이관
  자체가 병목이 된다. 개통 승인은 그 자체가 드문 상태변경 이벤트라
  `CUTOVER_APPROVED` 1건을 남긴다.
- **HR 연동(직원 마스터 동기화)은 범위 밖이다** — 이 도구는 `Employee`/
  `EmployeeSiteAssignment`를 새로 만들지 않는다. 직원은 이미 존재한다고
  가정하고 `employeeNo`로만 매칭한다(STEP10 인사 연동 어댑터가 그 부분을
  담당, 아직 미착수).

## 3. 스키마 추가

- `AttendanceRecordSource{CALCULATED MIGRATION}` 신규 enum, `AttendanceDaily`/
  `AttendanceMonthly`에 `source` 컬럼 추가.
- 신규 `SiteCutover`(siteId 유니크, cutoverDate, status PENDING/APPROVED,
  approvedAt/approvedBy).
- 신규 `MigrationReconciliationRecord`(siteCutoverId, siteId, employeeId,
  metric, manualValue, migratedValue, diff — `@@unique([siteCutoverId,
  employeeId, metric])`).

## 4. `apps/api/src/modules/migration/` 엔드포인트

- `GET/POST /admin/migration/cutover` — 기준일 조회/설정(이미 승인된
  사업장은 재설정 차단).
- `GET /admin/migration/excel/template?siteId=` — 사업장 전용 다중 시트
  워크북(연차잔액/연차촉진이력/마감월집계/마감월일별상세(선택)/교대패턴/
  확정스케줄/수기집계대사 + 직원·교대패턴·휴가유형 참고 시트).
- `POST /admin/migration/excel/validate` — dry-run. 행단위 오류
  (`{sheet, rowNumber, employeeNo?, message}[]`)가 하나라도 있으면
  아무것도 적재하지 않는다.
- `POST /admin/migration/excel/commit` — validate가 발급한 commitToken으로
  실제 적재(트랜잭션, 타임아웃 30초).
- `GET /admin/migration/cutover/readiness?siteId=` — ★ 근로자 단위 대사
  리포트(`{ready, totalRecords, unresolvedCount, mismatches}`) 그 자체.
- `POST /admin/migration/cutover/approve`(`HQ_HR`,`ADMIN`만) — ★ 대사
  불일치가 남아 있으면 `CutoverReconciliationNotZeroError`(400)로 차단.

## 5. 검증

- `test/migration-dryrun-50-employee.e2e-spec.ts` — 완료조건1(50명 규모
  dry-run, 오류 없음, 아무것도 적재되지 않음을 직접 카운트로 증명).
- `test/migration-row-error-report.e2e-spec.ts` — 완료조건2(잔액 음수
  1건/존재하지 않는 사번 1건 각각 그 근로자를 정확히 지목, 오탐 없음도
  함께 확인).
- `test/migration-reconciliation-cutover-approval.e2e-spec.ts` — 완료조건3
  (수기값=이관값 → 대사 통과+승인 성공, 수기값(7)≠이관값(18) → 그 근로자가
  리포트에 지목되고 승인이 400으로 차단됨, `SiteCutover.status`가
  `PENDING`으로 유지됨).
- `test/migration-payroll-close-protection.e2e-spec.ts` — §2의 핵심 설계를
  직접 증명(마감월 이관이 `PayrollClose{CLOSED}`를 만들고, 그 월 재계산
  시도가 `PayrollPeriodClosedError`로 거부되며 이관 데이터가 그대로
  보존됨).

`apps/admin-web/app/(authenticated)/migration/page.tsx` — 기준일 설정→
업로드(`MigrationUploadPanel`, `ExcelUploadPanel` 패턴 복제)→대사
리포트 표→"개통 승인" 버튼(`readiness.ready===false`면 비활성화, 완료조건3
의 버튼 비활성화 요구사항을 직접 구현).
