-- CreateEnum
CREATE TYPE "PromotionWave" AS ENUM ('WAVE_A', 'WAVE_B');

-- AlterEnum
ALTER TYPE "LeaveRequestStatus" ADD VALUE 'CANCEL_PENDING';

-- DropIndex
DROP INDEX "leave_balance_employee_id_leave_type_id_reference_period_idx";

-- AlterTable
ALTER TABLE "leave_balance" ADD COLUMN     "effective_date" DATE NOT NULL,
ADD COLUMN     "expiry_date" DATE NOT NULL;

-- AlterTable
ALTER TABLE "leave_promotion_log" ADD COLUMN     "due_date" DATE NOT NULL,
ADD COLUMN     "unused_days_at_step" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "wave" "PromotionWave";

-- AlterTable
ALTER TABLE "leave_request" ADD COLUMN     "approver_id" UUID,
ADD COLUMN     "deducted_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "leave_balance_id" UUID;

-- AlterTable
ALTER TABLE "leave_type" ADD COLUMN     "application_deadline_days_before_use" INTEGER;

-- CreateTable
CREATE TABLE "compensatory_leave_conversion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "source_overtime_request_id" UUID,
    "source_work_date" DATE NOT NULL,
    "source_category" TEXT NOT NULL,
    "source_minutes" INTEGER NOT NULL,
    "applied_premium_rate" DECIMAL(4,3) NOT NULL,
    "compensatory_leave_minutes" INTEGER NOT NULL,
    "leave_balance_id" UUID NOT NULL,
    "converted_by" UUID NOT NULL,
    "converted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compensatory_leave_conversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compensatory_leave_conversion_source_overtime_request_id_key" ON "compensatory_leave_conversion"("source_overtime_request_id");

-- CreateIndex
CREATE INDEX "compensatory_leave_conversion_employee_id_source_work_date_idx" ON "compensatory_leave_conversion"("employee_id", "source_work_date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balance_employee_id_leave_type_id_reference_period_key" ON "leave_balance"("employee_id", "leave_type_id", "reference_period");

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_leave_balance_id_fkey" FOREIGN KEY ("leave_balance_id") REFERENCES "leave_balance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensatory_leave_conversion" ADD CONSTRAINT "compensatory_leave_conversion_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensatory_leave_conversion" ADD CONSTRAINT "compensatory_leave_conversion_source_overtime_request_id_fkey" FOREIGN KEY ("source_overtime_request_id") REFERENCES "overtime_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensatory_leave_conversion" ADD CONSTRAINT "compensatory_leave_conversion_leave_balance_id_fkey" FOREIGN KEY ("leave_balance_id") REFERENCES "leave_balance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
