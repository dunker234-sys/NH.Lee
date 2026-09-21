-- CreateEnum
CREATE TYPE "PayrollCloseStage" AS ENUM ('NOT_STARTED', 'SITE_SUBMITTED', 'REGION_APPROVED', 'HQ_FINALIZED');

-- CreateEnum
CREATE TYPE "PayrollCloseBatchType" AS ENUM ('INITIAL_CLOSE', 'RECLOSE');

-- CreateEnum
CREATE TYPE "PayrollCloseBatchRowChangeType" AS ENUM ('ADDED', 'REMOVED', 'CHANGED');

-- CreateEnum
CREATE TYPE "PayrollLayoutType" AS ENUM ('MONTHLY', 'DAILY');

-- CreateEnum
CREATE TYPE "WageType" AS ENUM ('HOURLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PayrollExportFormat" AS ENUM ('EXCEL', 'CSV');

-- CreateEnum
CREATE TYPE "PayrollTransmissionStatus" AS ENUM ('EXPORTED', 'SENT', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayrollValidationSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKING');

-- CreateEnum
CREATE TYPE "PayrollValidationRuleCode" AS ENUM ('MONTHLY_HOURS_OUTLIER', 'EXCESSIVE_OVERTIME', 'BREAK_NOT_GRANTED', 'CONSECUTIVE_WORKDAY_EXCEEDED');

-- AlterTable
ALTER TABLE "payroll_close" ADD COLUMN     "last_validation_report_id" UUID,
ADD COLUMN     "region_approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "region_approved_by" UUID,
ADD COLUMN     "reopen_reason" TEXT,
ADD COLUMN     "reopened_at" TIMESTAMPTZ(6),
ADD COLUMN     "reopened_by" UUID,
ADD COLUMN     "site_submitted_at" TIMESTAMPTZ(6),
ADD COLUMN     "site_submitted_by" UUID,
ADD COLUMN     "stage" "PayrollCloseStage" NOT NULL DEFAULT 'NOT_STARTED';

-- CreateTable
CREATE TABLE "payroll_close_batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payroll_close_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "period_year_month" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "batch_type" "PayrollCloseBatchType" NOT NULL,
    "triggered_by" UUID NOT NULL,
    "changed_employee_count" INTEGER NOT NULL DEFAULT 0,
    "changed_item_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_close_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_close_batch_row" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "change_type" "PayrollCloseBatchRowChangeType" NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "changed_fields" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_close_batch_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_statement_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payroll_close_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "period_year_month" TEXT NOT NULL,
    "layout_type" "PayrollLayoutType" NOT NULL,
    "work_date" DATE,
    "scheduled_work_minutes" INTEGER NOT NULL DEFAULT 0,
    "approved_overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "unapproved_overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "night_work_minutes" INTEGER NOT NULL DEFAULT 0,
    "holiday_work_minutes_normal" INTEGER NOT NULL DEFAULT 0,
    "holiday_work_minutes_excess" INTEGER NOT NULL DEFAULT 0,
    "absence_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lateness_days" INTEGER NOT NULL DEFAULT 0,
    "early_leave_days" INTEGER NOT NULL DEFAULT 0,
    "paid_leave_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "unpaid_leave_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "weekly_paid_rest_eligible_count" INTEGER NOT NULL DEFAULT 0,
    "weekly_paid_rest_minutes" INTEGER NOT NULL DEFAULT 0,
    "ordinary_hourly_wage_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "base_pay_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "overtime_pay_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "night_pay_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "holiday_pay_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "weekly_paid_rest_pay_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "total_pay_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL,
    "calc_version" INTEGER NOT NULL DEFAULT 1,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "input_snapshot_hash" TEXT NOT NULL,

    CONSTRAINT "payroll_statement_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_wage_rate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "wage_type" "WageType" NOT NULL,
    "base_amount" DECIMAL(12,0) NOT NULL,
    "effective_start_date" DATE NOT NULL,
    "effective_end_date" DATE,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_wage_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_column_mapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "layout_type" "PayrollLayoutType" NOT NULL,
    "site_id" UUID,
    "columns" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_column_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_export_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payroll_close_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "period_year_month" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "format" "PayrollExportFormat" NOT NULL,
    "layout_type" "PayrollLayoutType" NOT NULL,
    "column_mapping_id" UUID,
    "exported_by" UUID NOT NULL,
    "exported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_checksum" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "transmission_status" "PayrollTransmissionStatus" NOT NULL DEFAULT 'EXPORTED',
    "transmission_ref" TEXT,

    CONSTRAINT "payroll_export_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_close_validation_report" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "period_year_month" TEXT NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by" UUID,
    "finding_count" INTEGER NOT NULL DEFAULT 0,
    "blocking_count" INTEGER NOT NULL DEFAULT 0,
    "acknowledged_at" TIMESTAMPTZ(6),
    "acknowledged_by" UUID,

    CONSTRAINT "payroll_close_validation_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_close_validation_finding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "employee_id" UUID,
    "rule_code" "PayrollValidationRuleCode" NOT NULL,
    "severity" "PayrollValidationSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "payroll_close_validation_finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_close_batch_site_id_period_year_month_idx" ON "payroll_close_batch"("site_id", "period_year_month");

-- CreateIndex
CREATE INDEX "payroll_close_batch_row_batch_id_idx" ON "payroll_close_batch_row"("batch_id");

-- CreateIndex
CREATE INDEX "payroll_close_batch_row_employee_id_idx" ON "payroll_close_batch_row"("employee_id");

-- CreateIndex
CREATE INDEX "payroll_statement_item_site_id_period_year_month_idx" ON "payroll_statement_item"("site_id", "period_year_month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_statement_item_payroll_close_id_employee_id_work_da_key" ON "payroll_statement_item"("payroll_close_id", "employee_id", "work_date");

-- CreateIndex
CREATE INDEX "employee_wage_rate_employee_id_effective_start_date_idx" ON "employee_wage_rate"("employee_id", "effective_start_date");

-- CreateIndex
CREATE INDEX "payroll_export_record_site_id_period_year_month_idx" ON "payroll_export_record"("site_id", "period_year_month");

-- CreateIndex
CREATE INDEX "payroll_close_validation_report_site_id_period_year_month_g_idx" ON "payroll_close_validation_report"("site_id", "period_year_month", "generated_at");

-- CreateIndex
CREATE INDEX "payroll_close_validation_finding_report_id_idx" ON "payroll_close_validation_finding"("report_id");

-- AddForeignKey
ALTER TABLE "payroll_close_batch" ADD CONSTRAINT "payroll_close_batch_payroll_close_id_fkey" FOREIGN KEY ("payroll_close_id") REFERENCES "payroll_close"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_close_batch" ADD CONSTRAINT "payroll_close_batch_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_close_batch_row" ADD CONSTRAINT "payroll_close_batch_row_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "payroll_close_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_close_batch_row" ADD CONSTRAINT "payroll_close_batch_row_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_statement_item" ADD CONSTRAINT "payroll_statement_item_payroll_close_id_fkey" FOREIGN KEY ("payroll_close_id") REFERENCES "payroll_close"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_statement_item" ADD CONSTRAINT "payroll_statement_item_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_statement_item" ADD CONSTRAINT "payroll_statement_item_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_wage_rate" ADD CONSTRAINT "employee_wage_rate_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_column_mapping" ADD CONSTRAINT "payroll_column_mapping_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_export_record" ADD CONSTRAINT "payroll_export_record_payroll_close_id_fkey" FOREIGN KEY ("payroll_close_id") REFERENCES "payroll_close"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_export_record" ADD CONSTRAINT "payroll_export_record_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_export_record" ADD CONSTRAINT "payroll_export_record_column_mapping_id_fkey" FOREIGN KEY ("column_mapping_id") REFERENCES "payroll_column_mapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_close_validation_report" ADD CONSTRAINT "payroll_close_validation_report_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_close_validation_finding" ADD CONSTRAINT "payroll_close_validation_finding_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "payroll_close_validation_report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_close_validation_finding" ADD CONSTRAINT "payroll_close_validation_finding_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
