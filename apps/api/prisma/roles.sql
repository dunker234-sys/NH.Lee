-- DB 롤 분리 (STEP 1 추가 지시, CLAUDE.md 절대 규칙 1)
-- postgres 슈퍼유저로 실행한다: psql -U postgres -h localhost -f prisma/roles.sql
--
-- app_rw       : API 서버(NestJS) 런타임 계정. punch_raw는 SELECT/INSERT만 가능하고
--                UPDATE/DELETE는 절대 부여하지 않는다 (append-only 강제).
-- migrator     : 스키마 변경(DDL) 전용. 애플리케이션 런타임에서는 사용하지 않는다.
-- retention_job: 위치정보 파기 배치 전용. punch_location만 DELETE 가능하고
--                punch_raw에는 어떤 권한도 없다.

\set ON_ERROR_STOP on

CREATE DATABASE attendance;

\c attendance

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw LOGIN PASSWORD 'app_rw_dev_password';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'migrator') THEN
    -- CREATEDB: `prisma migrate dev`가 드리프트 감지용 shadow database를
    -- 스스로 만들고 지울 수 있어야 하기 때문이다. 운영에서는 migrate deploy만
    -- 쓰고 shadow database가 필요 없으므로, 운영 DB의 migrator에는 CREATEDB를
    -- 부여하지 않는 것을 권장한다 (이 스크립트는 로컬 개발용).
    CREATE ROLE migrator LOGIN PASSWORD 'migrator_dev_password' CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'retention_job') THEN
    CREATE ROLE retention_job LOGIN PASSWORD 'retention_job_dev_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE attendance TO app_rw, migrator, retention_job;

-- migrator: 스키마 소유자로서 DDL 전권한 (prisma migrate deploy 전용 계정)
ALTER DATABASE attendance OWNER TO migrator;
GRANT ALL PRIVILEGES ON SCHEMA public TO migrator;

-- app_rw: migrator가 만드는 모든 향후 테이블에 기본적으로 SELECT/INSERT/UPDATE/DELETE를
-- 상속시킨다. punch_raw만은 마이그레이션 후 roles_post_migrate.sql에서 UPDATE/DELETE를
-- 개별 REVOKE한다 (테이블이 존재해야 REVOKE 가능하므로 스키마 적용 후 실행).
GRANT USAGE ON SCHEMA public TO app_rw, retention_job;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_rw;

-- retention_job은 여기서 광범위한 기본 권한을 주지 않는다. punch_location DELETE /
-- audit_log INSERT만 roles_post_migrate.sql에서 정확히 부여한다 (최소 권한 원칙).
