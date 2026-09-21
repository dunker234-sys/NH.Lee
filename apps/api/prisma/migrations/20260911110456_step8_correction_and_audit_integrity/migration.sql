-- STEP8: punch_raw append-only 트리거(보조 수단, CLAUDE.md 절대 규칙 1).
-- app_rw의 UPDATE/DELETE 권한은 이미 roles_post_migrate.sql(STEP1)에서
-- 회수됐다 — 이 트리거는 역할 권한과 무관하게 UPDATE/DELETE 자체를 한 번 더
-- 막는 두 번째 방어선이다(예: migrator처럼 UPDATE 권한을 가진 계정의 실수).
CREATE OR REPLACE FUNCTION prevent_punch_raw_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'punch_raw is append-only (op=%, session_user=%)', TG_OP, session_user;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER punch_raw_append_only
  BEFORE UPDATE OR DELETE ON "punch_raw"
  FOR EACH ROW EXECUTE FUNCTION prevent_punch_raw_mutation();

-- AlterTable: 컬럼을 먼저 nullable로 추가한다 — 상수 DEFAULT 한 번으로 채우지
-- 않고 기존 값(integrity_flags 배열 길이)으로부터 명시적 backfill UPDATE를
-- 수행해, 방금 설치한 트리거가 있는 상태에서도 "컬럼 추가+backfill" 마이그
-- 레이션이 정상 동작함을 이 마이그레이션 자체가 증명한다.
ALTER TABLE "punch_raw" ADD COLUMN "integrity_flag_count" INTEGER;

-- 트리거는 UPDATE/DELETE를 무조건 차단하므로, migrator가 이 backfill UPDATE
-- 직전에만 명시적으로 끄고 직후 다시 켠다 — 이 disable/enable은 이 마이그
-- 레이션 파일에 영구히 기록되어 감사 가능하고(git에 커밋됨), 트랜잭션 범위를
-- 벗어나 트리거가 "계속 꺼진 채로 남는" 일은 없다(같은 트랜잭션 안에서 다시
-- 켬). CLAUDE.md 절대 규칙 1의 "트리거는 실수 방지용 보조 수단" 원칙 그대로.
ALTER TABLE "punch_raw" DISABLE TRIGGER "punch_raw_append_only";
UPDATE "punch_raw" SET "integrity_flag_count" = COALESCE(array_length("integrity_flags", 1), 0);
ALTER TABLE "punch_raw" ENABLE TRIGGER "punch_raw_append_only";

ALTER TABLE "punch_raw" ALTER COLUMN "integrity_flag_count" SET DEFAULT 0;
ALTER TABLE "punch_raw" ALTER COLUMN "integrity_flag_count" SET NOT NULL;

-- AlterEnum: 휴게 미부여 신고(CLAUDE.md 절대 규칙 3)를 정정 신청 사유로 받는다.
ALTER TYPE "CorrectionReasonCode" ADD VALUE 'BREAK_NOT_GRANTED';

-- AlterTable: 감사로그 조회 화면의 "근로자"(이벤트의 대상)와 "행위자"
-- (actor_principal, 이벤트를 발생시킨 사람)를 구분하기 위한 컬럼. 과거 이벤트는
-- backfill하지 않고 NULL로 남긴다 — 이번 STEP부터 쓰는 이벤트 타입만 채운다.
ALTER TABLE "audit_log" ADD COLUMN     "subject_employee_id" UUID;

-- CreateIndex
CREATE INDEX "audit_log_subject_employee_id_occurred_at_idx" ON "audit_log"("subject_employee_id", "occurred_at");

-- CreateIndex: Merkle 봉인 배치가 같은 시간대를 중복 실행해도 멱등하도록 한다.
CREATE UNIQUE INDEX "audit_log_merkle_root_period_start_period_end_key" ON "audit_log_merkle_root"("period_start", "period_end");
