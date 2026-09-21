# INCIDENT_RUNBOOK — 장애 대응 런북

STEP12 운영 문서. `GET /admin/ops/monitoring`(`OpsMonitoringService`,
`apps/api/src/modules/ops-monitoring/`)이 노출하는 6개 지표와, 그 밖에
운영 중 실제로 발생 가능한 장애 시나리오별 대응 절차를 정리한다.

## 0. 공통 원칙

- **먼저 데이터를 보존한다.** `punch_raw`는 append-only이므로 장애 대응
  과정에서 이 테이블에 UPDATE/DELETE를 시도하는 조치는 어떤 경우에도 하지
  않는다(DB 롤 권한상 애초에 불가능해야 정상이다 — 만약 가능하다면 그 자체가
  더 심각한 사고다).
- **판단이 필요한 조치(재계산 강제 재실행, 마감 잠금 해제 등)는 `HQ_HR`
  승인 없이 임의로 하지 않는다.**
- 아래 각 절차의 "확인" 단계는 되도록 읽기 전용 쿼리로 먼저 진행한다.

## 1. 지표별 대응

### 1.1 타각 실패율 (`punchFailureRatePercent`)

`access_log`에서 `punches` 리소스의 DENIED(401/403/조직스코프 누락) 비율.
**주의**: 400(검증 실패)은 이 지표에 잡히지 않는다 — 인증/인가 실패에 가까운
근사치다.

- 급격히 상승 → 우선 인증 인프라(JWT 발급, Redis 세션/토큰 캐시) 장애를
  의심한다. `AppThrottlerGuard`가 정상 피크 트래픽(분당 500건)까지는 차단하지
  않도록 설계돼 있으므로, 타각 엔드포인트에서 다발하는 429는 예상 밖 — 레이트
  리밋 설정(`app.module.ts`의 `ThrottlerModule.forRoot`)이 실수로 좁혀지지
  않았는지 먼저 확인한다.
- 특정 사업장에서만 발생 → 그 사업장의 `site_ip_allowlist`(PC 웹) 또는
  키오스크 기기 자격증명 만료를 의심한다.

### 1.2 미등록 건수 (`todayNoShowCount`) / 미승인 실적 미판정 건수 (`unapprovedUnjudgedCount`)

지표 자체는 정상 업무량일 수 있다(사업장 특성상 매일 일정 건수 발생).
**급증**이 신호다.

- 미등록 건수 급증 → 직전 야간 스케줄 생성 배치 실패 또는 특정 사업장
  네트워크 장애(타각 자체가 안 됨, §1.1과 함께 확인)를 의심한다.
- 미승인 실적 미판정 건수가 계속 누적(감소하지 않음) → 해당 사업장 관리자가
  검토 큐를 확인하지 않고 있을 가능성 — `NotificationService`를 통한 리마인더
  발송 여부를 `alert_log`에서 확인하고, 필요 시 권역 관리자에게 에스컬레이션.

### 1.3 배치 성공률 (`batchSuccessRatePercent`) / DLQ 적체 (`totalFailedBacklog`, `queues[].failedBacklog`)

10개 큐(`recalculation`, `weekly-recalc-batch`, `monthly-recalc-batch`,
`fraud-detection`, `weekly-alert`, `notifications`, `no-show-detection`,
`hr-sync`, `audit-merkle-seal`, `punch-location-retention`) 각각의
`completed`/`failed` 기반. BullMQ 네이티브 failed 목록이 곧 DLQ다(별도 DLQ
큐를 두지 않는 기존 컨벤션).

- 특정 큐만 `failedBacklog` > 0 → 해당 큐의 실패 작업을 BullMQ 관리 도구(또는
  `queue.getFailed()`)로 열어 에러 스택을 확인한다. 대부분의 컨슈머는
  `@OnWorkerEvent('error')` 핸들러가 있어 앱이 죽지는 않지만, 원인 조치 없이
  재시도만 반복하면 적체가 계속 쌓인다.
- **`punch-location-retention` 큐가 실패** → §2(위치정보 파기 배치 실패)로
  간다. 이 큐는 법정 의무 배치이므로 최우선 조사 대상이다.
- **`monthly-recalc-batch`/`weekly-recalc-batch` 큐가 실패** → 급여 마감
  직전 기간이면 마감 완료조건(미승인 실적 잔존 검사)에 영향을 줄 수 있다 —
  마감 담당자에게 즉시 알린다.
- 연결 고갈로 여러 큐가 동시에 실패 → `connection_limit`(현재 40, B3) 근처까지
  BullMQ 동시성 합(36) + HTTP 요청이 몰렸을 가능성. `docker-compose.yml`/
  Terraform(`rds.tf`)의 인스턴스 클래스 상향 또는 워커 동시성 하향을 검토한다.

### 1.4 알림 발송 성공률 (`notificationSuccessRatePercent`)

최근 24시간 `settledAt` 기준. 급락 시 FCM/APNs 자격증명 만료, 또는
`NotificationService`(STEP4.5, 유일한 발송 경로)의 채널별 어댑터 장애를
의심한다. 특정 채널(PUSH/EMAIL/IN_APP)만 실패하는지 `alert_log`를
채널별로 group by 해 좁힌다.

## 2. 위치정보 파기 배치 실패 (★ 최우선 시나리오)

매일 03:00 KST 실행(`PunchLocationRetentionScheduleService`). 정상 실행 시
`audit_log`에 `PUNCH_LOCATION_PURGED` 이벤트가 1건 남는다(건수·기간·실행자
포함, `scopeBypassed: true`).

1. **확인**: 오늘 날짜로 `PUNCH_LOCATION_PURGED` 이벤트가 있는지
   `admin/audit`에서 조회. 없으면 배치가 아예 실행되지 않았거나 실패한 것.
2. **원인 분리**: `punch-location-retention` 큐의 실패 작업 에러를 먼저 본다.
   - `RETENTION_JOB_DATABASE_URL` 연결 실패(자격증명 만료/네트워크) → DB
     롤(`retention_job`) 비밀번호·연결 문자열 확인. 이 계정은 구조적으로
     `punch_raw`에 쓰기가 불가능하므로, 연결만 살아있으면 삭제 로직 자체가
     `punch_raw`를 건드릴 위험은 없다.
   - 청크 삭제 중 타임아웃 → 1000건 단위 청크가 비정상적으로 커진 경우가
     아니라면(로그 확인) 일시적 DB 부하 문제일 가능성이 높다 — 재시도로
     해결되는지 지켜본다.
3. **수동 재실행**: 원인 조치 후, 같은 큐에 정기 스윕 job을 수동으로 1회
   enqueue해 즉시 재실행할 수 있다(스케줄 서비스의 `OnModuleInit` 로직과
   동일한 job을 관리 스크립트로 재투입).
4. **사후 확인**: 재실행 후 `PUNCH_LOCATION_PURGED` 이벤트 및 삭제 건수가
   기대 범위인지 확인하고, **`punch_raw` 행 수가 변하지 않았는지**
   대사한다(완료조건: "punch_raw는 그대로 남음").

## 3. 급여 마감 파이프라인 중 장애

- **`submit`이 이유 없이 `PAYROLL_CLOSE_BLOCKED`로 반복 거부** → 검증
  엔드포인트(`admin/payroll-close/:siteId/:yearMonth/validation`)로 정확한
  차단 사유(미승인 실적 잔존 등)를 먼저 확인한다. 사유 없이 막히면
  `pg_advisory_xact_lock` 기반 배타 잠금이 이전 요청에서 정상 해제되지
  않았을 가능성 — 해당 트랜잭션이 남아있는지 DB에서 `pg_locks`를 확인한다.
- **재마감 diff가 예상과 다르게 표시** → 재계산 배치(월간/주간)가 재마감
  시점 직전에 완료됐는지 먼저 확인한다(diff는 저장된 스냅샷 비교이므로,
  최신 재계산 반영 전 상태와 비교하면 오해를 부른다).

## 4. Docker/배포 장애 (C1~C4)

- **ECS 롤링 배포가 멈춤(신규 태스크가 healthy로 안 넘어감)** →
  `GET /health` 응답 확인, `deployment_circuit_breaker`가 자동 롤백했는지
  ECS 콘솔에서 확인(`infra/terraform/ecs.tf`). 대부분 `DATABASE_URL`/
  `RETENTION_JOB_DATABASE_URL` 등 Secrets Manager 값이 `REPLACE_AFTER_APPLY`
  placeholder 그대로인 최초 배포 실수다(`infra/terraform/README.md` 참고).
- **마이그레이션 one-off 태스크 실패** → `docker-migrate.sh`는 `prisma
  migrate deploy` → `roles_post_migrate.sql` → 시드 9종 순서로 실행된다.
  중간 단계 실패 시 그 다음 단계부터 이어서 재실행할 수 있는지(멱등성)
  스크립트 순서를 보고 판단 — `prisma migrate deploy`는 멱등이지만 시드
  스크립트는 스크립트별로 확인이 필요하다.

## 5. 향후 과제 (이 STEP 범위 밖)

실 클라우드 계정이 연결되면 `admin/ops/monitoring`을 Prometheus exporter로
대체/보완하고, Grafana 대시보드+Alertmanager로 위 임계값 기반 알림을
자동화하는 것을 권장한다. 그 전까지는 이 6개 지표를 정기적으로(권장: 근무
시작 전 1회) 수동 확인한다.
