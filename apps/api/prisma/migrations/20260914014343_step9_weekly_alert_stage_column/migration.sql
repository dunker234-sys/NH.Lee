-- CreateEnum
CREATE TYPE "WeeklyAlertStage" AS ENUM ('NONE', 'ATTENTION', 'WARNING', 'DANGER', 'EXCEEDED');

-- AlterTable
ALTER TABLE "attendance_weekly" ADD COLUMN     "alert_stage" "WeeklyAlertStage" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE INDEX "attendance_weekly_week_start_date_alert_stage_idx" ON "attendance_weekly"("week_start_date", "alert_stage");
