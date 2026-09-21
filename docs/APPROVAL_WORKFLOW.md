# APPROVAL_WORKFLOW — STEP 6.5 신청·승인 워크플로우

`apps/api/src/modules/approval/`(신규) + `apps/api/src/common/policy/
approval-policy-resolver.service.ts`(신규). admin-web UI는 이번 STEP
프롬프트에 요구되지 않아 범위 밖 — 백엔드 API만 구현했다.

## 1. 왜 이 STEP이 필요했나

STEP1이 `OvertimeRequest`/`DispatchRequest`/`PayrollClose`를 이미
스키마에 심어뒀고(`bulkApprovalBatchId`까지 미리 넣어 이 STEP의 일괄
승인을 예견), STEP3의 `packages/core-rules`가 "근로 미제공" 판정
제외 로직을 `daily-attendance.ts:134-143`에 이미 완전히 구현해뒀다
(`workNotProvidedJudgment.judged===true`일 때만 미승인 연장을 0으로
만드는 유일한 코드 경로 — 기존 스펙이 이미 커버). STEP3.5의
`attendance-input-builder.service.ts`도 `resolveOvertimeApproved()`로
`OvertimeRequest.status==='APPROVED'`를 이미 읽고 있었고,
`RecalculationTriggerService.onOvertimeOrDispatchApproved()`도 이미
존재해 호출을 기다리고 있었다. `GeofenceService.evaluate()`도 승인된
`DispatchRequest`를 이미 읽어 지오펜스 예외를 준다. 즉 STEP3·4가 이
승인 데이터를 **소비**하는데 **생산**하는 기능이 전혀 없었다 — 이
STEP은 정확히 그 생산 경로(신청·승인 API)를 만든다.

## 2. 스키마 추가

- `WorkNotProvidedJudgment`(신규) — `(employeeId, workDate)` 유니크.
  `version` 컬럼을 두지 않는다: 재판정/취소 API를 별도로 만들지 않고
  upsert 하나로 최초 판정과 정정을 모두 처리한다 — 완료조건이 취소를
  요구하지 않고, 감사로그의 전/후 값(`beforeValue`/`afterValue`)으로
  이력이 손실 없이 남기 때문이다.
- `Delegation`(신규, `DelegationStatus{ACTIVE,REVOKED}`) — 대결/위임.
  `siteId` nullable(null=delegator 전체 스코프).
- `EarlyClockInPatternFlag`(신규) — `(employeeId, yearMonth)` 유니크.
  `NoShowNotificationTarget`("하루 1건" 모델)을 재사용하지 않는다 —
  이건 "월 단위 집계 + 정리 여부 추적"이라 모양이 다르다.
- `policy_config` 신규 키 2개(`approval-policy-defaults.ts`) —
  `earlyClockInMinutesThreshold`(10), `earlyClockInMonthlyOccurrenceThreshold`(3).

## 3. 기존 코드 변경 — 새 계산 로직 없음

- `RecalculationTriggerService.onWorkNotProvidedJudged()` 1개 메서드
  추가(기존 `enqueue()` 패턴 재사용). `onOvertimeOrDispatchApproved()`는
  이미 있었고 연장/외근 승인 양쪽에 그대로 재사용한다.
- `attendance-input-builder.service.ts` — `workNotProvidedJudgment: null`
  하드코딩을 `resolveWorkNotProvidedJudgment()`(신규, `resolveOvertimeApproved()`
  미러링)로 교체하고 5-way `Promise.all`에 편입. **`rawSnapshot`에도
  반드시 포함시켰다** — `inputSnapshotHash`(멱등성 판정 근거)에 반영되지
  않으면 판정 전/후 재계산이 "입력 동일"로 오판해 스킵될 위험이 있었다.
- `GeofenceService`/core-rules 계산 로직은 **변경 없음** — 이미 완전히
  동작하던 기존 코드 위에 신규 승인 엔드포인트만 얹었다.

## 4. `apps/api/src/modules/approval/` 엔드포인트

- `POST/GET /me/overtime-requests` — 본인 연장근로 신청(사전/사후)·조회.
- `GET admin/approval/overtime-requests` — org-scope 필터 목록.
- `GET admin/approval/overtime-requests/unapproved-actuals?siteId=&from=&to=` —
  ★ 일괄 승인 소스. `AttendanceDaily.status='UNAPPROVED_ACTUAL'` 목록에
  기존 `OvertimeRequest`(있다면)를 붙여 반환.
- `POST admin/approval/overtime-requests/:id/{approve,reject}` —
  `{expectedVersion}` 버전 체크, 409 `OVERTIME_REQUEST_VERSION_CONFLICT`.
- `POST admin/approval/overtime-requests/bulk-approve` — ★ 급식 현장은
  건별 사전승인이 비현실적이라, 관리자가 미승인 실적 목록에서 다중
  선택 승인한다. **버전 체크 생략**(`status='PENDING'` 또는 행 자체가
  없는 상태가 동시성 가드 — `schedule.confirmMany()`와 같은 이유).
  각 `{employeeId, targetDate}`에 대해 기존 PENDING 요청이 있으면
  승인 전환, 없으면 `AttendanceDaily.unapprovedOvertimeMinutes`를
  `expectedMinutes`로 스냅샷해 `{requestType:'POST', status:'APPROVED'}`로
  즉시 생성한다 — 이 한 번의 생성이 "사후 신청"과 "일괄 승인"을 동시에
  만족한다. 배치 1건 감사로그(`OVERTIME_BULK_APPROVED`), 처리된 날짜마다
  `onOvertimeOrDispatchApproved()` 재계산 트리거.
- `POST/GET /me/dispatch-requests` — 본인 외근/출장/지원 신청. `isPostHoc`
  DTO 필드가 곧 "사전/사후" 구분이다 — `!isPostHoc && startDate < 오늘`이면
  400 `DISPATCH_PRE_APPROVAL_PAST_DATE`(긴급 지원은 사전 신청 불가능,
  사후 신청 경로를 쓰라는 신호).
- `GET/POST admin/approval/dispatch-requests[/:id/{approve,reject}]` —
  승인 시 `[startDate,endDate]` 전체 날짜에 재계산 트리거 반복 호출.
  **지오펜스 예외 자체는 코드 변경 불필요** — 기존 `GeofenceService`가
  이미 승인된 `DispatchRequest`를 라이브 조회해 통과시킨다.
- `POST admin/approval/work-not-provided-judgments` — `{employeeId,
  workDate, reason}`, 서비스 레벨에서도 사유를 재검증(DTO와 이중 방어).
  `before=findUnique→upsert→auditLog.write(before/after)→notify→
  recalcTrigger.onWorkNotProvidedJudged()` 순서.
- `GET admin/approval/work-not-provided-judgments` — 조회/감사용.
- `POST/GET /me/delegations`, `POST /me/delegations/:id/revoke`(본인만,
  idempotent).
- `GET admin/approval/approval-line?siteId=&asOfDate=` —
  `ApprovalLineResolverService.resolveApprovers()` 조회.
- `POST admin/approval/early-clock-in/detect` — 조기출근 반복 패턴
  수동/테스트 트리거. **BullMQ 자동 등록은 이번 STEP에서 하지 않는다**
  (파일럿 검증 후 후속 작업 — `no-show-schedule.service.ts` 참고 시
  5줄이면 된다).
- `GET admin/approval/reports/unapproved-overtime?yearMonth=&siteId=` —
  `siteId` 지정 시 직원별 breakdown, 생략 시 호출자 org-scope 안
  **사업장별** 롤업("승인 절차가 운영되지 않는 사업장 식별"이 목적).
- `GET admin/approval/payroll-close/readiness?siteId=&yearMonth=` —
  `{blocked, unresolvedCount}` 읽기 전용.

## 5. 결재선은 인가 게이트가 아니다

`ApprovalLineResolverService.resolveApprovers(siteId, asOfDate)`는
사업장 SITE_MANAGER → 없으면 REGIONAL(같은 리전 전 사업장) → 없으면
HQ_HR로 에스컬레이션하고, 각 단계에서 활성 `Delegation`이 있으면
대체/추가한다. **용도는 알림 라우팅 전용**이다 — 기존 `@Roles()+
OrgScope` 모델이 이미 "그 사업장을 관할하는 관리자라면 누구나 승인
가능"을 보장하므로, 이 리졸버에 버그가 있어도 정당한 관리자의 승인
자체를 막지 않도록 의도적으로 인가 판단에서 분리했다.

## 6. 마감 차단 가드

`PayrollCloseGuardService.hasUnresolvedUnapprovedActuals(siteId,
yearMonth)` — `AttendanceDaily.status='UNAPPROVED_ACTUAL'` 존재 여부.
STEP11(급여 마감)이 아직 없으므로 지금은 export만 해 두고(향후
`close()` 엔드포인트가 주입해 호출), 읽기 전용 `readiness` 엔드포인트로
지금 당장 검증 가능하게 노출했다.

## 7. 실측으로 발견한 버그 — 재계산 큐의 고정 jobId

`RecalculationTriggerService.enqueue()`가 쓰는 `recalculationJobId()`는
`employeeId_workDate`로 고정된 BullMQ 잡 ID다(같은 날짜의 중복 트리거를
자연스럽게 접기 위한 의도적 설계). 그런데 큐 등록 시 `removeOnComplete`
옵션이 없어 완료된 잡이 그대로 남아 있었고, **완료된 잡과 같은 ID로
다시 `add()`하면 BullMQ가 재처리 없이 조용히 기존 완료 잡을 반환한다.**
STEP6.5 이전에는 한 (직원,근로일)에 대해 재계산 트리거가 두 번째로
불릴 일이 실질적으로 없어 드러나지 않았지만, "승인 후 재계산"(이미
한 번 `PUNCH_SAVED`로 계산된 날짜를 `OVERTIME_OR_DISPATCH_APPROVED`/
`WORK_NOT_PROVIDED_JUDGED`로 다시 트리거)에서 정확히 이 경로를 타
실측으로 발견했다. `recalculation.module.ts`의 `defaultJobOptions`에
`removeOnComplete: true`를 추가해 고쳤다 — 실패 잡은 그대로 남겨
`RecalculationOpsService.retryFailedJobs()`의 DLQ 용도를 유지한다.

## 8. 테스트

- `test/approval-overtime-bulk.e2e-spec.ts` — 완료조건1: 사전
  `OvertimeRequest` 없이 일괄 승인 한 번으로 사후 신청 생성+승인+
  집계 전환(`unapprovedOvertimeMinutes→0`, `approvedOvertimeMinutes>0`)까지.
- `test/approval-work-not-provided.e2e-spec.ts` — 완료조건2: 사유
  누락 400, 정상 판정/재판정 둘 다 감사로그 전/후 값 확인, 판정 후
  재계산으로 `unapprovedOvertimeMinutes===0`(core-rules 기존 로직 발동
  확인).
- `test/approval-dispatch-geofence.e2e-spec.ts` — 완료조건3: 사후
  신청→승인 후 반경 밖 타각이 지오펜스 플래그 없이 저장, 대조군(승인
  없음)은 플래그 있음(회귀 방지).
- `test/approval-payroll-close-guard.e2e-spec.ts` — 완료조건4:
  `PayrollCloseGuardService` 직접 호출 + `readiness` 엔드포인트 둘 다
  `blocked:true→false` 전환 확인.

`packages/core-rules`는 이번 STEP에서 변경 없음(§1 근거) — TDD 대상이
아니라 기존 109개 테스트 재실행으로 회귀만 확인했다(그대로 통과).
