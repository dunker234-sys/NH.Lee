-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "work_not_provided_judgment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "judged_by" UUID NOT NULL,
    "judged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_not_provided_judgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delegator_id" UUID NOT NULL,
    "delegate_id" UUID NOT NULL,
    "site_id" UUID,
    "reason" TEXT NOT NULL,
    "effective_start_date" DATE NOT NULL,
    "effective_end_date" DATE,
    "status" "DelegationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "early_clock_in_pattern_flag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "year_month" TEXT NOT NULL,
    "occurrence_count" INTEGER NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "resolution_note" TEXT,

    CONSTRAINT "early_clock_in_pattern_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_not_provided_judgment_site_id_work_date_idx" ON "work_not_provided_judgment"("site_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "work_not_provided_judgment_employee_id_work_date_key" ON "work_not_provided_judgment"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "delegation_delegator_id_effective_start_date_idx" ON "delegation"("delegator_id", "effective_start_date");

-- CreateIndex
CREATE INDEX "delegation_delegate_id_effective_start_date_idx" ON "delegation"("delegate_id", "effective_start_date");

-- CreateIndex
CREATE INDEX "early_clock_in_pattern_flag_site_id_year_month_idx" ON "early_clock_in_pattern_flag"("site_id", "year_month");

-- CreateIndex
CREATE UNIQUE INDEX "early_clock_in_pattern_flag_employee_id_year_month_key" ON "early_clock_in_pattern_flag"("employee_id", "year_month");

-- AddForeignKey
ALTER TABLE "work_not_provided_judgment" ADD CONSTRAINT "work_not_provided_judgment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_not_provided_judgment" ADD CONSTRAINT "work_not_provided_judgment_judged_by_fkey" FOREIGN KEY ("judged_by") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_not_provided_judgment" ADD CONSTRAINT "work_not_provided_judgment_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_delegator_id_fkey" FOREIGN KEY ("delegator_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_delegate_id_fkey" FOREIGN KEY ("delegate_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "early_clock_in_pattern_flag" ADD CONSTRAINT "early_clock_in_pattern_flag_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "early_clock_in_pattern_flag" ADD CONSTRAINT "early_clock_in_pattern_flag_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "early_clock_in_pattern_flag" ADD CONSTRAINT "early_clock_in_pattern_flag_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
