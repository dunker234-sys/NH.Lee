-- attendance_test 통합 테스트 DB. app_rw/migrator/retention_job 롤은 이미
-- 클러스터 전역에 존재하므로(roles.sql), 여기서는 DB 생성과 기본 권한만 다시 잡는다.
-- 실행: psql -U postgres -h localhost -f apps/api/test/setup/create-test-db.sql

\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE attendance_test OWNER migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'attendance_test')
\gexec

\c attendance_test

GRANT ALL PRIVILEGES ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app_rw, retention_job;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
