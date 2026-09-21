-- CreateEnum
CREATE TYPE "AttendanceRecordSource" AS ENUM ('CALCULATED', 'MIGRATION');

-- CreateEnum
CREATE TYPE "SiteCutoverStatus" AS ENUM ('PENDING', 'APPROVED');

-- CreateEnum
CREATE TYPE "ReconciliationMetric" AS ENUM ('ANNUAL_LEAVE_REMAINING_DAYS', 'ATTENDANCE_MONTHLY_ACTUAL_MINUTES');

-- AlterTable
ALTER TABLE "attendance_daily" ADD COLUMN     "source" "AttendanceRecordSource" NOT NULL DEFAULT 'CALCULATED';

-- AlterTable
ALTER TABLE "attendance_monthly" ADD COLUMN     "source" "AttendanceRecordSource" NOT NULL DEFAULT 'CALCULATED';

-- CreateTable
CREATE TABLE "site_cutover" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "cutover_date" DATE NOT NULL,
    "status" "SiteCutoverStatus" NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_cutover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_reconciliation_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_cutover_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "metric" "ReconciliationMetric" NOT NULL,
    "manual_value" DECIMAL(10,2) NOT NULL,
    "migrated_value" DECIMAL(10,2) NOT NULL,
    "diff" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_reconciliation_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_cutover_site_id_key" ON "site_cutover"("site_id");

-- CreateIndex
CREATE INDEX "migration_reconciliation_record_site_id_diff_idx" ON "migration_reconciliation_record"("site_id", "diff");

-- CreateIndex
CREATE UNIQUE INDEX "migration_reconciliation_record_site_cutover_id_employee_id_key" ON "migration_reconciliation_record"("site_cutover_id", "employee_id", "metric");

-- AddForeignKey
ALTER TABLE "site_cutover" ADD CONSTRAINT "site_cutover_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_cutover" ADD CONSTRAINT "site_cutover_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_reconciliation_record" ADD CONSTRAINT "migration_reconciliation_record_site_cutover_id_fkey" FOREIGN KEY ("site_cutover_id") REFERENCES "site_cutover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_reconciliation_record" ADD CONSTRAINT "migration_reconciliation_record_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

