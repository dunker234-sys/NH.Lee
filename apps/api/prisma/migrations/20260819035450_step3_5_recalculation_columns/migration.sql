-- AlterEnum
ALTER TYPE "AttendanceDailyStatus" ADD VALUE 'REVIEW_REQUIRED';

-- AlterTable
ALTER TABLE "attendance_daily" ADD COLUMN     "paid_leave_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scheduled_excess_minutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "attendance_weekly" ADD COLUMN     "flexible_work_skipped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "total_overtime_for_premium_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weekly_basis_overtime_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weekly_paid_rest_eligible" BOOLEAN;
