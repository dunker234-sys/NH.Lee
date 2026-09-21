-- CreateTable
CREATE TABLE "night_work_health_checkup_status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "window_end_date" DATE NOT NULL,
    "criterion1_count" INTEGER NOT NULL,
    "criterion1_met" BOOLEAN NOT NULL,
    "criterion2_total_minutes" INTEGER NOT NULL,
    "criterion2_met" BOOLEAN NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "night_work_health_checkup_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "night_work_health_checkup_status_employee_id_key" ON "night_work_health_checkup_status"("employee_id");

-- CreateIndex
CREATE INDEX "night_work_health_checkup_status_site_id_eligible_idx" ON "night_work_health_checkup_status"("site_id", "eligible");

-- AddForeignKey
ALTER TABLE "night_work_health_checkup_status" ADD CONSTRAINT "night_work_health_checkup_status_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "night_work_health_checkup_status" ADD CONSTRAINT "night_work_health_checkup_status_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
