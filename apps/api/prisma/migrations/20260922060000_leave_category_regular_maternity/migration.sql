-- AlterEnum
-- 2026-09 수정사항: 휴가유형 관리 화면에 "정기휴가"/"산전후휴가" 카테고리를 추가한다.
-- 가산적 변경(ADD VALUE)이라 기존 leave_type/leave_balance 행에는 영향이 없다.
ALTER TYPE "LeaveCategory" ADD VALUE 'REGULAR';
ALTER TYPE "LeaveCategory" ADD VALUE 'MATERNITY';
