# 데이터 모델 — STEP 1

전체 ERD와 설계 근거는 STEP 1 착수 시 검토·확정한 다이어그램을 기준으로 한다
(5개 도메인: 조직·인사 / 근태 원본·집계 / 신청·워크플로우 / 정책·거버넌스 /
알림·동의·감사, 28개 테이블). 실제 소스 오브 트루스는
[`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)이다.

## 로컬 개발 환경 실행

```bash
# 1) 의존성 설치 (저장소 루트에서)
pnpm install

# 2) apps/api/.env.example을 .env로 복사하고 DB 접속정보를 채운다
# 3) DB·롤 생성 (최초 1회, postgres 슈퍼유저로 실행)
psql -U postgres -h localhost -f apps/api/prisma/roles.sql

# 4) 마이그레이션 적용 — 이때만 DATABASE_URL을 migrator 계정으로 바꾼다
pnpm --filter @attendance/api exec prisma migrate deploy

# 5) 마이그레이션 후 punch_raw UPDATE/DELETE 권한 회수 등 후속 권한 적용
psql -U postgres -h localhost -d attendance -f apps/api/prisma/roles_post_migrate.sql

# 6) DATABASE_URL을 app_rw 계정으로 되돌린 뒤 시드 실행
pnpm --filter @attendance/api exec prisma db seed
```

이 순서는 `apps/api/prisma/roles.sql` → `prisma migrate deploy` →
`apps/api/prisma/roles_post_migrate.sql` → `prisma db seed`이며, STEP 1에서
실제로 로컬 PostgreSQL 17에 적용해 정상 동작을 확인했다.

## 파티셔닝 권고 대상

3,736명 × 3년치를 가정한 규모 산정이다. 모두 date 컬럼(`work_date` 계열)으로
range 파티셔닝하며, `recorded_at`/`occurred_at` 같은 timestamptz 컬럼은
파티션 키로 쓰지 않는다(CLAUDE.md 절대 규칙 5). **이번 STEP에서는 아래 대상과
방식만 문서화하고, 실제 파티셔닝 DDL은 적용하지 않았다** — 초기 데이터량에서
과설계이며, 필요 시점(운영 데이터 적재 이후)에 별도 마이그레이션으로 전환한다.

| 테이블 | 파티션 키 | 주기 | 근거 |
|---|---|---|---|
| `punch_raw` | `work_date` | 월 | 3,736명 × 1일 다건 × 3년 — 최대 볼륨 테이블. 3년 보존기간 만료분을 파티션 단위로 drop 가능 |
| `access_log` | `occurred_at` 기준 파생 컬럼 필요 | 월 | 조회·일반 요청 전량 기록이라 볼륨이 가장 크고 변동폭도 큼. 단기 보존 후 drop |
| `attendance_daily` | `work_date` | 월 | 3,736 × 365 × 3 ≈ 400만 행. 월별 마감·조회 패턴과 파티션 경계가 일치 |
| `audit_log` | `occurred_at` 기준 파생 컬럼 필요 | 분기 | 상태 변경만 대상이라 상대적 저볼륨이지만 장기 보존 대상. 해시 체인 순서는 파티션과 무관하게 `seq`(bigint, 전역 시퀀스)로 보장되므로 파티셔닝해도 체인 무결성에는 영향 없음 |
| `punch_location` | `purge_scheduled_at` | 분기 | 파기 배치가 삭제 대상만 빠르게 스캔하도록. 데이터량 자체는 `punch_raw`보다 작음(사후 파기로 계속 축소) |

`location_access_log`는 초기엔 미분할로 시작하고, 열람 빈도가 실측된 뒤
분기 단위 파티셔닝 여부를 재검토한다.

### 파티셔닝 유보 재확정 (STEP12 B2)

위 유보 결정을 재검토했고, 여전히 **유보를 유지**한다. 근거:

1. 현재 운영 데이터량이 파티셔닝을 정당화할 볼륨에 미달(아래 실측 참고).
2. `punch_raw`는 append-only 트리거(`punch_raw_append_only`)가 걸려 있어,
   파티션 테이블로 전환하려면 PK를 `(id, work_date)` 복합키로 바꾸는
   무중단 운영 중 고위험 마이그레이션이 필요하다(§51 참고 주석).
3. 요구사항 문구 자체가 "필요 시" 조건부다.

**재검토 트리거 임계값** — 아래 중 하나라도 충족하면 파티셔닝 전환 작업을
착수한다:

| 테이블 | 재검토 트리거 | 근거 |
|---|---|---|
| `punch_raw` | 500만 행 초과 | 3,736명 × 3년 풀스케일 추정치(약 820만 행)의 약 60% 지점 — 월별 파티션 drop으로 3년 보존 정책을 걸기 전에 여유를 두고 전환 |
| `access_log` | 1,000만 행 초과 또는 조회 P95가 200ms 초과 | 조회·일반 요청 전량 기록이라 가장 먼저 커질 테이블 |
| `attendance_daily` | 300만 행 초과 | 400만 행 풀스케일 추정치의 75% 지점 |
| `audit_log` | 분기별 100만 행 초과 | 해시 체인 검증 배치(`audit-merkle-seal`) 소요시간이 함께 늘어나는지 확인 후 결정 |

### 3대 핵심 쿼리 패턴 EXPLAIN ANALYZE 실측 (STEP12 B2)

로컬 PostgreSQL 17, `attendance_test` DB에 3,741명 × 최근 30일 합성 데이터
(`punch_raw` 224,460행, `attendance_daily` 112,230행)를 적재해 실측했다
(측정 후 데이터는 TRUNCATE로 원복). 대상은 실제 운영 부하가 가장 큰 3가지
패턴:

**① P95 타각 경로 — 일별 재계산의 `employee_id+work_date` 조회**
(`attendance-input-builder.service.ts`의 `gatherEffectivePunches`가 매
타각/일별 재계산마다 실행)

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM punch_raw
WHERE employee_id = $1 AND work_date = current_date
ORDER BY recorded_at ASC;
```

`punch_raw_employee_id_work_date_idx`로 Index Scan, **Execution Time 0.097ms**.
Planning Time(7.96ms)이 오히려 더 크게 잡힌 것은 첫 실행 시 플랜 캐시가
비어 있었기 때문 — 실제 운영에서는 prepared statement 캐싱으로 무시할
수준. 인덱스가 정확히 의도대로 쓰이고 있어 추가 조치 불필요.

**② 주간/월간 배치 팬아웃 — 직원별 기간 범위 조회(최근 30일)**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM punch_raw
WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3
ORDER BY recorded_at ASC;
```

`punch_raw_employee_id_recorded_at_idx`를 Bitmap Index Scan으로 사용,
**Execution Time 0.321ms**(60행). 옵티마이저가 `employee_id_work_date_idx`
대신 `employee_id_recorded_at_idx`를 골랐는데, 범위 조건이 `work_date`에
걸려 있어도 결과 정렬(`ORDER BY recorded_at`)과 맞아떨어지는 후자가 더
저렴하다고 판단한 것 — 두 인덱스 모두 이미 존재하므로 추가 조치 불필요.
월간 배치(3,736명 팬아웃)에서 이 쿼리가 동시성 10으로 반복 실행되는데,
단건이 0.3ms 수준이므로 배치 전체 소요시간은 재계산 로직(순수 함수 계산)
쪽이 병목이지 이 쿼리가 병목이 아님을 확인했다(B1의 3,741명 풀스케일
실측 13.2초와 정합).

**③ 대시보드 집계 — 사업장 당일 출근 인원(`DISTINCT employee_id`)**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT DISTINCT employee_id FROM punch_raw
WHERE work_date = current_date AND punch_type = 'IN' AND site_id = $1;
```

`punch_raw_site_id_work_date_idx`로 Bitmap Index Scan 후 HashAggregate,
**Execution Time 2.067ms**(3,740행 반환). `punch_type`은 이 인덱스에
포함돼 있지 않아 Filter 단계에서 걸러지지만(Rows Removed by Filter: 3,740),
데이터량 대비 비용이 낮아 실용적으로 문제없다. 이 지점이 재검토 임계값
(`access_log` 1,000만 행/P95 200ms)에 준하는 부담을 보이면
`(site_id, work_date, punch_type)` 3컬럼 인덱스 추가를 우선 검토한다.

**결론**: 3개 패턴 모두 기존 인덱스만으로 밀리초 단위 응답 — B4 부하테스트의
`POST /punches` P95(<1초) 여유분에서 DB 쿼리 자체는 병목이 아님을 뒷받침한다.

> **참고**: Postgres에서 파티션 테이블은 PK/UNIQUE 제약이 파티션 키를 포함해야
> 한다. 실제 전환 시 `punch_raw`의 PK를 `(id, work_date)` 복합키로,
> `idempotency_key` UNIQUE를 `(idempotency_key, work_date)`로 바꿔야 한다
> (`recorded_at` → `work_date`가 결정적 함수이므로 의미상 전역 유니크와 동등하다).

## 인덱스 전략

조직 스코프 이중 필터(역할 × 스코프)가 인덱스만으로 해결되도록 설계했다.

- `employee(primary_site_id)`, `employee_site_assignment(employee_id, site_id)`,
  `site(region_id)` — "이 요청자가 이 사업장을 볼 수 있는가"를 인덱스 스캔만으로 판정.
- `attendance_daily`, `schedule`, `punch_raw`는 각각 `(site_id, work_date)`와
  `(employee_id, work_date)` 복합 인덱스를 둔다 — 사업장 관리자 화면과 근로자
  개인 화면 양쪽 조회 패턴을 커버한다.
- `punch_raw.idempotency_key`, `employee.employee_no`, `site.code`,
  `region.code`, `leave_type.code`는 UNIQUE 인덱스.
- `audit_log(resource_type, resource_id, occurred_at)`로 "특정 레코드의 변경
  이력" 조회를 지원하고, `seq` PK로 해시 체인 순서를 보장한다.
- `policy_config`는 표준 UNIQUE로 표현할 수 없는 "site_id IS NULL(전사
  기본값)은 1개만" 제약을 부분 유니크 인덱스 2개로 구현했다
  (마이그레이션 `20260818062738_policy_config_partial_unique`).

## DB 롤 분리

`apps/api/prisma/roles.sql`(사전) / `roles_post_migrate.sql`(사후)로 구현했고,
로컬에서 실제 권한 회수를 확인했다(`app_rw`로 `punch_raw` UPDATE/DELETE 시도 →
권한 오류).

| 롤 | 권한 | 용도 |
|---|---|---|
| `app_rw` | 전 테이블 SELECT/INSERT/UPDATE/DELETE. 단 `punch_raw`는 SELECT/INSERT만(UPDATE/DELETE 회수) | API 서버(NestJS) 런타임 계정 |
| `migrator` | 스키마 변경(DDL) 전체 권한 + `attendance` DB 소유자 | CI/CD 마이그레이션 파이프라인 전용. 애플리케이션 런타임에서는 사용하지 않는다 |
| `retention_job` | `punch_location` SELECT/DELETE, `audit_log` INSERT, `punch_raw` SELECT만(수정 권한 없음) | 위치정보 파기 배치(STEP 12) 전용 SYSTEM 주체 |

`punch_raw` append-only는 트리거가 아니라 `app_rw`의 UPDATE/DELETE 권한
자체를 회수하는 방식으로 강제한다. 트리거는 실수 방지용 보조 수단으로만
둔다.

★ STEP 8에서 `punch_raw_append_only` 트리거를 실제로 추가했다
(마이그레이션 `20260911110456_step8_correction_and_audit_integrity`) —
`app_rw` 권한 회수를 우회할 수 있는 계정(예: `migrator`)의 실수까지
잡는 2차 방어선이다. 이 트리거가 설치된 뒤로 `punch_raw`에 컬럼을
추가하고 backfill해야 하는 향후 마이그레이션은 같은 파일 안에서
`ALTER TABLE punch_raw DISABLE TRIGGER punch_raw_append_only;` →
백필 `UPDATE` → `ALTER TABLE punch_raw ENABLE TRIGGER
punch_raw_append_only;` 순서로 명시적으로 열고 닫아야 한다(같은
트랜잭션 안에서 다시 켜므로 트리거가 영구히 꺼진 채 남지 않는다) —
그 마이그레이션 파일 자체가 이 절차의 예시다.

## 확정 시 유보했던 결정 (검토 단계에서 그대로 채택)

- `attendance_weekly`/`attendance_monthly`는 뷰가 아니라 실체 테이블로
  구현했다 — `calc_version`/`calculated_at`으로 STEP 3.5 재계산 이력을
  추적해야 하기 때문이다.
- `correction_request`는 근로자 신청과 관리자 직권 정정을 `request_source`
  컬럼(EMPLOYEE/ADMIN_DIRECT)으로 구분해 한 테이블에 담았다 — 둘 다
  "원본은 그대로 두고 보정 레코드를 추가"하는 동일한 흐름이기 때문이다.

## 알려진 갭 (후속 STEP에서 다룸)

- 인증 자격 증명(비밀번호 해시, 리프레시 토큰, 기기 바인딩 이력)은 STEP 2에서
  별도 테이블로 추가한다. `employee.role`만 지금 만들어 두었다.
- 미성년자·임신 중 근로자 판정(STEP 3 유연근로제 차단 조건)에 필요한
  생년월일·임신 여부 등의 필드는 이번 STEP의 ERD에 포함하지 않았다.
  생년월일은 그렇다 쳐도 임신 여부는 민감정보라 저장 방식(별도 동의·접근
  제어 필요 여부)을 제품/법무 차원에서 먼저 결정해야 하므로, STEP 3 착수
  시점에 별도로 다시 검토한다.
- `partner_company`(협력사) 테이블은 아직 없다. `employee.partner_company_id`는
  STEP 10(HR 연동)에서 테이블이 생기기 전까지 FK 제약 없이 값만 보관한다.
