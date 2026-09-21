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
