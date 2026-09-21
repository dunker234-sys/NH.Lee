-- prisma migrate deploy(또는 dev) 실행 후, 테이블이 실제로 존재하는 상태에서 실행한다.
-- psql -U postgres -h localhost -d attendance -f prisma/roles_post_migrate.sql
--
-- CLAUDE.md 절대 규칙 1: punch_raw는 어떤 경우에도 UPDATE/DELETE 하지 않는다.
-- app_rw는 roles.sql의 ALTER DEFAULT PRIVILEGES로 모든 테이블에 UPDATE/DELETE를
-- 상속받았으므로, punch_raw에 한해서만 명시적으로 회수한다.

\set ON_ERROR_STOP on

REVOKE UPDATE, DELETE ON public.punch_raw FROM app_rw;

-- retention_job: 위치정보 파기 배치 전용 최소 권한.
-- punch_location만 조회·삭제하고, 파기 사실을 audit_log에 남긴다.
GRANT SELECT, DELETE ON public.punch_location TO retention_job;
GRANT INSERT ON public.audit_log TO retention_job;
GRANT SELECT ON public.punch_raw TO retention_job; -- 파기 대상 판별 시 punch_id 조회용 (수정 권한 없음)

-- migrator는 시퀀스/향후 테이블에도 계속 전권을 가지므로 별도 조치 불필요.
