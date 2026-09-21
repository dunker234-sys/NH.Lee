-- CreateEnum
CREATE TYPE "HrSyncTriggerType" AS ENUM ('SYSTEM', 'MANUAL');

-- CreateEnum
CREATE TYPE "HrSyncBatchStatus" AS ENUM ('PENDING_REVIEW', 'AUTO_APPLIED', 'APPLIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HrSyncRowChangeType" AS ENUM ('NEW', 'CHANGED', 'DEPARTED', 'ERROR');

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "department" TEXT,
ADD COLUMN     "hr_source_effective_date" DATE,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "manager_id" UUID;

-- CreateTable
CREATE TABLE "partner_company" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_sync_batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "triggered_by" "HrSyncTriggerType" NOT NULL,
    "status" "HrSyncBatchStatus" NOT NULL,
    "source_adapter_type" TEXT NOT NULL,
    "total_count" INTEGER NOT NULL,
    "new_count" INTEGER NOT NULL,
    "changed_count" INTEGER NOT NULL,
    "departed_count" INTEGER NOT NULL,
    "error_count" INTEGER NOT NULL,
    "change_ratio" DECIMAL(6,4) NOT NULL,
    "applied_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_sync_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_sync_batch_row" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "employee_no" TEXT NOT NULL,
    "change_type" "HrSyncRowChangeType" NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_sync_batch_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_company_code_key" ON "partner_company"("code");

-- CreateIndex
CREATE INDEX "hr_sync_batch_created_at_idx" ON "hr_sync_batch"("created_at");

-- CreateIndex
CREATE INDEX "hr_sync_batch_row_batch_id_idx" ON "hr_sync_batch_row"("batch_id");

-- CreateIndex
CREATE INDEX "employee_partner_company_id_idx" ON "employee"("partner_company_id");

-- CreateIndex
CREATE INDEX "employee_manager_id_idx" ON "employee"("manager_id");

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_partner_company_id_fkey" FOREIGN KEY ("partner_company_id") REFERENCES "partner_company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_sync_batch_row" ADD CONSTRAINT "hr_sync_batch_row_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "hr_sync_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
