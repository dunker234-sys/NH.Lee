# CORRECTION_AND_AUDIT — STEP 8 근태 정정 및 감사로그

`apps/api/src/modules/correction/`(신규) + `apps/api/src/modules/
audit-integrity/`(신규) + `apps/api/src/common/audit/`(해시/Merkle 유틸
추가) + `apps/api/src/common/correction/`(afterValue 스키마, 신청·재계산
공유) + `apps/api/src/common/policy/correction-policy-resolver.service.ts`
(신규). admin-web UI는 STEP6.5와 같은 이유로 이번 STEP 범위 밖(백엔드
API만 구현) — 5개 완료조건이 전부 API/DB 레벨로 검증 가능하고 UI를
요구하지 않는다.

## 1. 왜 이 STEP이 필요했나

STEP1이 이 STEP을 예상하고 스키마와 저수준 인프라를 상당 부분 미리
심어뒀다 — `CorrectionRequest`/`CorrectionReasonCode`/
`CorrectionRequestSource`/`CorrectionStatus`(`PENDING→APPROVED_L1→
APPROVED_L2`/`REJECTED`) 스키마 전체, `access_log`(해시 체인 없음)와
`audit_log`(해시 체인, `AuditLogService.write()`가 이미 진짜 값을
채우고 있었음), `AuditLogMerkleRoot` 테이블(미사용), `punch_raw`의
`app_rw` UPDATE/DELETE 권한 회수(`roles_post_migrate.sql`). STEP3.5의
`RecalculationTriggerService.onCorrectionApproved()`도 이미 존재해
호출을 기다리고 있었고, `AttendanceInputBuilderService.
gatherEffectivePunches()`도 이미 `status:{in:['APPROVED_L1',
'APPROVED_L2']}`인 `PUNCH_MISSING/DEVICE_ERROR/NETWORK_FAILURE` 정정을
계산 입력으로 반영하고 있었다(임시 컨벤션이라고 스스로 문서화한 채).
즉 이 STEP이 할 일은 그 배관에 실제 신청/승인 API를 얹고, `afterValue`
스키마를 확정하고, `punch_raw`에 보조 방어선(트리거)을 추가하고, 감사
로그의 Merkle 봉인·무결성 검증 배치를 새로 만드는 것이었다.

## 2. 스키마 추가 (`20260911110456_step8_correction_and_audit_integrity`)

- `punch_raw`에 append-only **트리거**(`punch_raw_append_only`) 추가 —
  DB 롤 권한 회수가 1차 방어선이고, 이 트리거는 UPDATE 권한을 가진
  계정(예: `migrator`)의 실수까지 잡는 2차 방어선이다. 같은 마이그레이션
  안에서 `integrity_flag_count`(신규 컬럼, `integrityFlags.length`를
  insert 시점에 비정규화) 추가 + backfill을 `ALTER TABLE ... DISABLE
  TRIGGER` → `UPDATE` → `ENABLE TRIGGER`로 수행해, **트리거 설치 후에도
  정상적인 스키마 마이그레이션이 막히지 않음을 그 마이그레이션 자체가
  증명**한다(완료조건2). `PunchRawRepository.toCreateData()`가 이후
  신규 행부터 이 값을 직접 채운다.
- `CorrectionReasonCode`에 `BREAK_NOT_GRANTED` 추가 — 휴게 미부여
  신고(CLAUDE.md 절대 규칙3)를 정정 신청 경로로 받기 위함.
- `AuditLog`에 `subjectEmployeeId`(nullable) 추가 — 조회 화면의
  "근로자"(이벤트의 대상)와 "행위자"(actor_principal)를 구분하기
  위함. 과거 이벤트는 backfill하지 않고 NULL로 남긴다.
- `AuditLogMerkleRoot`에 `@@unique([periodStart, periodEnd])` 추가 —
  봉인 배치가 같은 시간대를 다시 실행해도 멱등하다.

## 3. 기존 코드 변경

- `AuditLogService.write()` — 해시 입력 조립을 `audit-record-hash.util.ts`
  (신규)로 뽑았다. **동작은 그대로**(같은 필드·같은 순서)지만, STEP8
  무결성 검증 배치가 이 함수를 그대로 재사용해 절대 다른 방식으로
  해시를 재계산하지 않게 만든다 — 다르게 재계산하면 정상 데이터에서도
  오탐이 난다(완료조건4가 정확히 이걸 요구).
- `attendance-input-builder.service.ts` — `breakNotGrantedReported: false`
  하드코딩(주석: "STEP 8 정정 확장이 배선해야 한다")을
  `resolveBreakNotGrantedReported()`(신규, 승인된 `BREAK_NOT_GRANTED`
  정정 조회)로 교체. 기존 `parsePunchCorrectionPayload`/
  `PUNCH_AFFECTING_REASON_CODES`는 `common/correction/
  correction-payload.util.ts`(신규)로 옮겨 신청 시점(`CorrectionRequestService.
  submit`)과 재계산 시점 둘 다 같은 파서로 검증한다 — 이제 잘못된
  모양의 `afterValue`는 승인 이전, 신청 시점에 이미 막힌다.
- `MalformedCorrectionPayloadError` 메시지에서 "STEP8 정정 스키마 확정
  전까지의 임시 컨벤션" 문구를 제거했다 — 이 STEP이 그 스키마를 실제로
  확정했기 때문이다.

## 4. `apps/api/src/modules/correction/` 엔드포인트

- `POST/GET /me/correction-requests` — 본인 정정 신청·조회.
  `afterValue`는 사유코드별로 검증된다: `PUNCH_MISSING/DEVICE_ERROR/
  NETWORK_FAILURE`→`{punchType, recordedAt}`, `BREAK_NOT_GRANTED`→
  `{breakNotGranted:true}`, 그 외는 자유 형식(계산 미반영). 대상 월이
  이미 마감(`PayrollClose.status!=='OPEN'`)이면 400
  `CORRECTION_TARGET_PERIOD_CLOSED`, 신청 기한(policy_config
  `correctionRequestDeadlineDaysAfterMonthEnd`, 기본 10일) 초과 시 400
  `CORRECTION_REQUEST_DEADLINE_PASSED`.
- `GET admin/correction/requests`, `POST admin/correction/requests/:id/
  {approve,reject}` — 2단계 승인. `SITE_MANAGER`가 승인하면 정책값
  `correctionRequiresSecondApproval`(기본 1=필요)에 따라
  `APPROVED_L1`(2차 필요) 또는 바로 `APPROVED_L2`(불필요)로 전이한다.
  `REGIONAL`/`HQ_HR`/`ADMIN`은 `PENDING`에서도 바로 `APPROVED_L2`로
  건너뛸 수 있다(상급자가 1차를 거칠 필요는 없다는 계층 구조상 자연스러운
  허용). **어느 단계로 전이하든 재계산을 트리거한다** —
  `AttendanceInputBuilderService`가 `APPROVED_L1`도 이미 계산에
  반영하므로 "승인 즉시 재계산"이라는 요구사항과 일치한다. 승인 직전에도
  마감 여부를 다시 확인한다(신청 후 승인 전 사이에 마감될 수 있어서).
- `POST admin/correction/admin-direct` — 직권 정정, `@Roles('HQ_HR')`만.
  사유(`reasonDetail`) 필수, 즉시 `APPROVED_L2` + `requestSource:
  'ADMIN_DIRECT'`로 생성, 근로자 본인에게 통지.
- `GET admin/correction/report?...&requestSource=ADMIN_DIRECT` —
  `requestSource` 필터 하나로 "직권 정정 전량 추적 리포트" 역할까지
  겸한다(별도 엔드포인트를 만들지 않았다).

## 5. `apps/api/src/modules/audit-integrity/` — Merkle 봉인 · 무결성 검증 · 조회

- `AuditMerkleSealService.sealHour(periodStart)` — 그 1시간 구간
  `audit_log.record_hash`를 리프로 페어와이즈 Merkle 루트를 계산해
  `AuditLogMerkleRoot`에 upsert(멱등). 이벤트가 없는 시간대는 봉인하지
  않는다. `AuditMerkleSealScheduleService`가 BullMQ `repeat`(매시 5분,
  `no-show-schedule.service.ts`와 동일 컨벤션)으로 직전 완전한 1시간을
  자동 봉인한다.
- `AuditIntegrityVerifyService.verify(periodStart, periodEnd)` — 구간
  내 모든 행을 `seq asc`로 순회하며 (a) `prevHash`가 직전 행의
  `recordHash`와 일치하는지(체인 단절), (b) `computeAuditRecordHash()`로
  재계산한 값이 저장된 `record_hash`와 일치하는지(변조), (c) 그 구간에
  봉인된 `AuditLogMerkleRoot`가 있으면 현재 데이터로 재계산한 Merkle
  루트와 일치하는지(사후 변조) 확인한다. `GET admin/audit/integrity-check?
  from=&to=`(HQ_HR/ADMIN)로 온디맨드 실행 가능.
- `AuditLogReportService`/`AuditLogReportController` — 요구사항5의
  "조회 화면: 기간·사업장·근로자·행위자 필터, 엑셀 내보내기"
  (`GET admin/audit/log`, `GET admin/audit/log/export`). `audit_log`에는
  `siteId` 컬럼이 없어(resourceType이 다양해 일반적인 FK가 없다)
  "사업장" 필터는 그 사업장에 배정된 적 있는 `employeeId` 목록으로
  `subjectEmployeeId`를 좁히는 근사 방식을 쓴다(STEP7.5의 유사 리포트
  쿼리와 같은 수준의 근사). `SITE_MANAGER`/`REGIONAL`(OrgScope=SITES)는
  `siteId`가 필수이고, `subjectEmployeeId`가 NULL인 시스템/정책 레벨
  이벤트는 스코프가 ALL(HQ_HR/ADMIN)일 때만 노출된다. `AuditLog.seq`는
  `BigInt`라 JSON 직렬화 전에 문자열로 변환한다(그대로 반환하면 Express의
  `JSON.stringify`가 던진다 — 실측으로 발견).

## 6. 마감된 월의 정정 — 재마감(STEP11)과의 경계

`ROADMAP.md` STEP11이 "마감 프로세스"와 "재마감(버전 기록+차분 리포트)"
전체를 소관한다. STEP8은 그 재마감 API를 만들지 않는다 — 대신
(a) 정정 신청 시점에 대상 월이 이미 마감돼 있으면 즉시 400으로 막고,
(b) `assertPayrollOpen()`(`recalculation.service.ts`, STEP3.5)이 재계산
자체를 막는 기존 메커니즘을 그대로 신뢰하며, (c) 승인 시점에도 같은
검사를 한 번 더 해 "신청 후 승인 전 사이에 마감된" 경쟁 상황까지
막는다. 마감을 풀고 다시 거는 절차(재개방→정정 반영→재마감) 자체는
STEP11이 구현한다.

## 7. 테스트

- `test/punch-raw-append-only-trigger.e2e-spec.ts` — 완료조건1(회귀)+2:
  `app_rw` 권한 차단 재확인, `migrator`(UPDATE 권한 있음)도 트리거가
  막음(이중 방어선), 신규 삽입의 `integrity_flag_count` 정확성, 마이그
  레이션 backfill 자체의 정확성.
- `test/correction-approval-recalculation.e2e-spec.ts` — 완료조건5:
  1차 승인만으로 일·주·월 집계 갱신, 2차 승인 불필요 정책, 상급자의
  1차 건너뛰기, 직권 정정 경로.
- `test/correction-closed-period-block.e2e-spec.ts` — §6: 신청 시점·
  승인 시점(경쟁 상황) 둘 다 마감월 정정을 막음.
- `test/audit-log-concurrency.e2e-spec.ts` — 완료조건3: 100건 동시
  `write()`가 분기 없는 단일 체인을 만듦(테이블 전체 체인 무결성 검증
  포함 — 다른 SYSTEM 이벤트가 끼어들어도 분기하지만 않으면 통과).
- `test/audit-integrity-verify.e2e-spec.ts` — 완료조건4: 정상 데이터는
  봉인 전/후 모두 오탐 없음, 같은 시간대 재봉인 멱등성.
- `test/correction-report-and-audit-log-report.e2e-spec.ts` — 리포트
  필터의 사업장 스코프 차단, `requestSource` 필터, 감사로그 조회의
  `siteId` 강제와 엑셀 내보내기.

`packages/core-rules`는 이번 STEP에서 변경 없음 — 데이터 적재·감사이지
법령 계산 로직이 아니다(STEP7.5와 같은 판단).
