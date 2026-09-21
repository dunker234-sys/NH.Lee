-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('REGULAR', 'CONTRACT', 'PART_TIME', 'ULTRA_PART_TIME', 'DAILY', 'DISPATCHED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'RESIGNED');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('EMPLOYEE', 'SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN', 'PARTNER');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('LEGAL', 'SUBSTITUTE', 'AGREED', 'SITE_DESIGNATED');

-- CreateEnum
CREATE TYPE "HolidayScopeType" AS ENUM ('ALL', 'SITE_LIST');

-- CreateEnum
CREATE TYPE "ScheduleAssignmentType" AS ENUM ('INTERNAL_SUPPORT', 'OTHER_SITE_SUPPORT', 'DAILY_WORKER');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PunchType" AS ENUM ('IN', 'OUT', 'BREAK_OUT', 'BREAK_IN');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "RegistrationMethod" AS ENUM ('GPS', 'NFC', 'QR', 'PC', 'TABLET');

-- CreateEnum
CREATE TYPE "AttendanceDailyStatus" AS ENUM ('NORMAL', 'PENDING', 'UNAPPROVED_ACTUAL', 'LOCKED');

-- CreateEnum
CREATE TYPE "OvertimeRequestType" AS ENUM ('PRE', 'POST');

-- CreateEnum
CREATE TYPE "OvertimeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DispatchType" AS ENUM ('BUSINESS_TRIP', 'SITE_SUPPORT');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CorrectionReasonCode" AS ENUM ('PUNCH_MISSING', 'DEVICE_ERROR', 'NETWORK_FAILURE', 'DISPATCH', 'LOCATION_ERROR', 'SCHEDULE_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "CorrectionRequestSource" AS ENUM ('EMPLOYEE', 'ADMIN_DIRECT');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED_L1', 'APPROVED_L2', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('ANNUAL', 'HALF_DAY', 'QUARTER_DAY', 'CONGRATULATION', 'PUBLIC', 'SICK', 'UNPAID', 'SUBSTITUTE', 'COMPENSATORY');

-- CreateEnum
CREATE TYPE "LeaveDeductionUnit" AS ENUM ('FULL_DAY', 'HALF_DAY', 'HOUR');

-- CreateEnum
CREATE TYPE "LeaveUnit" AS ENUM ('FULL', 'HALF_AM', 'HALF_PM', 'QUARTER');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveBalanceSource" AS ENUM ('SYSTEM', 'MIGRATION');

-- CreateEnum
CREATE TYPE "PromotionProcedureType" AS ENUM ('ARTICLE_61_1', 'ARTICLE_61_2');

-- CreateEnum
CREATE TYPE "PromotionStep" AS ENUM ('FIRST_NOTICE', 'EMPLOYEE_RESPONSE', 'SECOND_NOTICE');

-- CreateEnum
CREATE TYPE "NoticeMethod" AS ENUM ('WRITTEN_PAPER', 'ELECTRONIC_DOCUMENT');

-- CreateEnum
CREATE TYPE "PayrollCloseStatus" AS ENUM ('OPEN', 'CLOSED', 'RECLOSED');

-- CreateEnum
CREATE TYPE "DeviceTokenPlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('LOCATION_COLLECTION');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('AGREED', 'PAUSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AccessLogResult" AS ENUM ('SUCCESS', 'DENIED');

-- CreateTable
CREATE TABLE "region" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region_id" UUID NOT NULL,
    "address" TEXT,
    "geofence_radius_m" INTEGER NOT NULL DEFAULT 100,
    "headcount_cache" INTEGER,
    "is_under_five_cache" BOOLEAN,
    "status" "SiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_headcount_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "effective_start_date" DATE NOT NULL,
    "effective_end_date" DATE,
    "calc_period_start" DATE NOT NULL,
    "calc_period_end" DATE NOT NULL,
    "total_person_days" INTEGER NOT NULL,
    "working_days" INTEGER NOT NULL,
    "average_headcount" DECIMAL(6,2) NOT NULL,
    "is_under_five" BOOLEAN NOT NULL,
    "leave_applicable" BOOLEAN NOT NULL,
    "basis" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "site_headcount_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_calendar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year" INTEGER NOT NULL,
    "holiday_date" DATE NOT NULL,
    "holiday_type" "HolidayType" NOT NULL,
    "name" TEXT NOT NULL,
    "is_paid" BOOLEAN NOT NULL,
    "scope_type" "HolidayScopeType" NOT NULL DEFAULT 'ALL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_calendar_site" (
    "holiday_calendar_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,

    CONSTRAINT "holiday_calendar_site_pkey" PRIMARY KEY ("holiday_calendar_id","site_id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employment_type" "EmploymentType" NOT NULL,
    "hire_date" DATE NOT NULL,
    "resignation_date" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "primary_site_id" UUID NOT NULL,
    "contracted_work_minutes" INTEGER,
    "role" "EmployeeRole" NOT NULL DEFAULT 'EMPLOYEE',
    "partner_company_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_site_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "assignment_role" "AssignmentRole" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_site_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_template" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "break_start_time" TIME(0),
    "break_end_time" TIME(0),
    "crosses_midnight" BOOLEAN NOT NULL DEFAULT false,
    "applicable_weekdays" INTEGER[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shift_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "shift_template_id" UUID,
    "planned_start_at" TIMESTAMPTZ(6) NOT NULL,
    "planned_end_at" TIMESTAMPTZ(6) NOT NULL,
    "planned_break_minutes" INTEGER NOT NULL DEFAULT 0,
    "substitute_for_employee_id" UUID,
    "substitute_reason" TEXT,
    "assignment_type" "ScheduleAssignmentType",
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_raw" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "punch_type" "PunchType" NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "work_date" DATE NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "verification_level" "VerificationLevel" NOT NULL DEFAULT 'NORMAL',
    "registration_method" "RegistrationMethod" NOT NULL,
    "device_id" TEXT NOT NULL,
    "integrity_flags" TEXT[],
    "client_event_id" TEXT,
    "receive_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "punch_raw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_location" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "punch_id" UUID NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "accuracy_m" DECIMAL(6,2) NOT NULL,
    "purge_scheduled_at" DATE NOT NULL,
    "purged_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punch_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_daily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "scheduled_work_minutes" INTEGER NOT NULL DEFAULT 0,
    "actual_work_minutes" INTEGER NOT NULL DEFAULT 0,
    "approved_overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "unapproved_overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "night_work_minutes" INTEGER NOT NULL DEFAULT 0,
    "holiday_work_minutes_normal" INTEGER NOT NULL DEFAULT 0,
    "holiday_work_minutes_excess" INTEGER NOT NULL DEFAULT 0,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "lateness_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_leave_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_absence" BOOLEAN NOT NULL DEFAULT false,
    "status" "AttendanceDailyStatus" NOT NULL DEFAULT 'PENDING',
    "calc_version" INTEGER NOT NULL DEFAULT 1,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "input_snapshot_hash" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,

    CONSTRAINT "attendance_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_weekly" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "week_start_date" DATE NOT NULL,
    "total_work_minutes" INTEGER NOT NULL DEFAULT 0,
    "over_40_minutes" INTEGER NOT NULL DEFAULT 0,
    "limit_violation_flag" BOOLEAN NOT NULL DEFAULT false,
    "calc_version" INTEGER NOT NULL DEFAULT 1,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_weekly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_monthly" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "year_month" TEXT NOT NULL,
    "totals" JSONB NOT NULL,
    "calc_version" INTEGER NOT NULL DEFAULT 1,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "request_type" "OvertimeRequestType" NOT NULL,
    "target_date" DATE NOT NULL,
    "expected_minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approver_id" UUID,
    "bulk_approval_batch_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "overtime_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "origin_site_id" UUID NOT NULL,
    "target_site_id" UUID,
    "dispatch_type" "DispatchType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "is_post_hoc" BOOLEAN NOT NULL DEFAULT false,
    "status" "DispatchStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dispatch_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "target_punch_id" UUID,
    "target_work_date" DATE NOT NULL,
    "reason_code" "CorrectionReasonCode" NOT NULL,
    "reason_detail" TEXT NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB NOT NULL,
    "evidence_url" TEXT,
    "request_source" "CorrectionRequestSource" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "correction_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_type" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "LeaveCategory" NOT NULL,
    "paid" BOOLEAN NOT NULL,
    "deduction_unit" "LeaveDeductionUnit" NOT NULL,
    "evidence_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "reference_period" TEXT NOT NULL,
    "granted_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "used_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "carried_over_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "expired_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "basis" JSONB NOT NULL,
    "source" "LeaveBalanceSource" NOT NULL DEFAULT 'SYSTEM',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "unit" "LeaveUnit" NOT NULL DEFAULT 'FULL',
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_promotion_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leave_balance_id" UUID NOT NULL,
    "procedure_type" "PromotionProcedureType" NOT NULL,
    "step" "PromotionStep" NOT NULL,
    "notice_date" DATE NOT NULL,
    "method" "NoticeMethod" NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "response_content" TEXT,
    "requirement_met" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_promotion_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "site_id" UUID,
    "effective_start_date" DATE NOT NULL,
    "effective_end_date" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labor_agreement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID,
    "agreement_type" TEXT NOT NULL,
    "effective_start_date" DATE NOT NULL,
    "effective_end_date" DATE,
    "document_reference" TEXT NOT NULL,
    "signed_date" DATE NOT NULL,
    "representative_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labor_agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_rule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID,
    "version" INTEGER NOT NULL,
    "effective_start_date" DATE NOT NULL,
    "effective_end_date" DATE,
    "document_reference" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_close" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "period_year_month" TEXT NOT NULL,
    "status" "PayrollCloseStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_close_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "platform" "DeviceTokenPlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "last_refreshed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "consent_type" "ConsentType" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "agreed_at" TIMESTAMPTZ(6),
    "paused_at" TIMESTAMPTZ(6),
    "withdrawn_at" TIMESTAMPTZ(6),
    "policy_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_access_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "punch_location_id" UUID,
    "accessed_by" TEXT NOT NULL,
    "access_purpose" TEXT NOT NULL,
    "accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_principal" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "org_scope_applied" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "request_path" TEXT,
    "ip_address" TEXT,
    "result" "AccessLogResult" NOT NULL DEFAULT 'SUCCESS',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "seq" BIGSERIAL NOT NULL,
    "actor_principal" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "before_value" JSONB,
    "after_value" JSONB,
    "reason" TEXT,
    "prev_hash" TEXT,
    "record_hash" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_id" UUID,
    "scope_bypassed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "audit_log_merkle_root" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL,
    "sealed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storage_ref" TEXT,

    CONSTRAINT "audit_log_merkle_root_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "region_code_key" ON "region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "site_code_key" ON "site"("code");

-- CreateIndex
CREATE INDEX "site_region_id_idx" ON "site"("region_id");

-- CreateIndex
CREATE INDEX "site_headcount_history_site_id_effective_start_date_idx" ON "site_headcount_history"("site_id", "effective_start_date");

-- CreateIndex
CREATE INDEX "holiday_calendar_year_idx" ON "holiday_calendar"("year");

-- CreateIndex
CREATE INDEX "holiday_calendar_holiday_date_idx" ON "holiday_calendar"("holiday_date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_employee_no_key" ON "employee"("employee_no");

-- CreateIndex
CREATE INDEX "employee_primary_site_id_idx" ON "employee"("primary_site_id");

-- CreateIndex
CREATE INDEX "employee_site_assignment_employee_id_site_id_idx" ON "employee_site_assignment"("employee_id", "site_id");

-- CreateIndex
CREATE INDEX "employee_site_assignment_site_id_employee_id_idx" ON "employee_site_assignment"("site_id", "employee_id");

-- CreateIndex
CREATE INDEX "shift_template_site_id_idx" ON "shift_template"("site_id");

-- CreateIndex
CREATE INDEX "schedule_employee_id_work_date_idx" ON "schedule"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "schedule_site_id_work_date_idx" ON "schedule"("site_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "punch_raw_idempotency_key_key" ON "punch_raw"("idempotency_key");

-- CreateIndex
CREATE INDEX "punch_raw_employee_id_work_date_idx" ON "punch_raw"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "punch_raw_site_id_work_date_idx" ON "punch_raw"("site_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "punch_location_punch_id_key" ON "punch_location"("punch_id");

-- CreateIndex
CREATE INDEX "punch_location_purge_scheduled_at_idx" ON "punch_location"("purge_scheduled_at");

-- CreateIndex
CREATE INDEX "attendance_daily_site_id_work_date_idx" ON "attendance_daily"("site_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_daily_employee_id_work_date_key" ON "attendance_daily"("employee_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_weekly_employee_id_week_start_date_key" ON "attendance_weekly"("employee_id", "week_start_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_monthly_employee_id_year_month_key" ON "attendance_monthly"("employee_id", "year_month");

-- CreateIndex
CREATE INDEX "overtime_request_employee_id_target_date_idx" ON "overtime_request"("employee_id", "target_date");

-- CreateIndex
CREATE INDEX "overtime_request_bulk_approval_batch_id_idx" ON "overtime_request"("bulk_approval_batch_id");

-- CreateIndex
CREATE INDEX "dispatch_request_employee_id_start_date_idx" ON "dispatch_request"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "correction_request_employee_id_target_work_date_idx" ON "correction_request"("employee_id", "target_work_date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_code_key" ON "leave_type"("code");

-- CreateIndex
CREATE INDEX "leave_balance_employee_id_leave_type_id_reference_period_idx" ON "leave_balance"("employee_id", "leave_type_id", "reference_period");

-- CreateIndex
CREATE INDEX "leave_request_employee_id_start_date_idx" ON "leave_request"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "leave_promotion_log_leave_balance_id_idx" ON "leave_promotion_log"("leave_balance_id");

-- CreateIndex
CREATE INDEX "policy_config_key_site_id_effective_start_date_idx" ON "policy_config"("key", "site_id", "effective_start_date");

-- CreateIndex
CREATE INDEX "labor_agreement_site_id_agreement_type_idx" ON "labor_agreement"("site_id", "agreement_type");

-- CreateIndex
CREATE INDEX "work_rule_site_id_idx" ON "work_rule"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_close_site_id_period_year_month_key" ON "payroll_close"("site_id", "period_year_month");

-- CreateIndex
CREATE INDEX "device_token_employee_id_idx" ON "device_token"("employee_id");

-- CreateIndex
CREATE INDEX "consent_employee_id_idx" ON "consent"("employee_id");

-- CreateIndex
CREATE INDEX "location_access_log_employee_id_accessed_at_idx" ON "location_access_log"("employee_id", "accessed_at");

-- CreateIndex
CREATE INDEX "access_log_actor_principal_occurred_at_idx" ON "access_log"("actor_principal", "occurred_at");

-- CreateIndex
CREATE INDEX "access_log_resource_type_resource_id_idx" ON "access_log"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_log_resource_type_resource_id_occurred_at_idx" ON "audit_log"("resource_type", "resource_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_merkle_root_period_start_period_end_idx" ON "audit_log_merkle_root"("period_start", "period_end");

-- AddForeignKey
ALTER TABLE "site" ADD CONSTRAINT "site_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_headcount_history" ADD CONSTRAINT "site_headcount_history_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_calendar_site" ADD CONSTRAINT "holiday_calendar_site_holiday_calendar_id_fkey" FOREIGN KEY ("holiday_calendar_id") REFERENCES "holiday_calendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_calendar_site" ADD CONSTRAINT "holiday_calendar_site_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_primary_site_id_fkey" FOREIGN KEY ("primary_site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_site_assignment" ADD CONSTRAINT "employee_site_assignment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_site_assignment" ADD CONSTRAINT "employee_site_assignment_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_template" ADD CONSTRAINT "shift_template_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_substitute_for_employee_id_fkey" FOREIGN KEY ("substitute_for_employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_shift_template_id_fkey" FOREIGN KEY ("shift_template_id") REFERENCES "shift_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_raw" ADD CONSTRAINT "punch_raw_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_raw" ADD CONSTRAINT "punch_raw_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_location" ADD CONSTRAINT "punch_location_punch_id_fkey" FOREIGN KEY ("punch_id") REFERENCES "punch_raw"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily" ADD CONSTRAINT "attendance_daily_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily" ADD CONSTRAINT "attendance_daily_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_weekly" ADD CONSTRAINT "attendance_weekly_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_monthly" ADD CONSTRAINT "attendance_monthly_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_request" ADD CONSTRAINT "overtime_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_request" ADD CONSTRAINT "overtime_request_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_request" ADD CONSTRAINT "dispatch_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_request" ADD CONSTRAINT "dispatch_request_origin_site_id_fkey" FOREIGN KEY ("origin_site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_request" ADD CONSTRAINT "dispatch_request_target_site_id_fkey" FOREIGN KEY ("target_site_id") REFERENCES "site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_request" ADD CONSTRAINT "correction_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_request" ADD CONSTRAINT "correction_request_target_punch_id_fkey" FOREIGN KEY ("target_punch_id") REFERENCES "punch_raw"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance" ADD CONSTRAINT "leave_balance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance" ADD CONSTRAINT "leave_balance_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_promotion_log" ADD CONSTRAINT "leave_promotion_log_leave_balance_id_fkey" FOREIGN KEY ("leave_balance_id") REFERENCES "leave_balance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_config" ADD CONSTRAINT "policy_config_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_agreement" ADD CONSTRAINT "labor_agreement_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_rule" ADD CONSTRAINT "work_rule_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_close" ADD CONSTRAINT "payroll_close_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_close" ADD CONSTRAINT "payroll_close_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_token" ADD CONSTRAINT "device_token_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_access_log" ADD CONSTRAINT "location_access_log_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
