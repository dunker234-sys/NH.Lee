-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "birth_date" DATE;

-- AlterTable
ALTER TABLE "shift_template" ADD COLUMN     "flexible_work_type" TEXT;

-- CreateTable
CREATE TABLE "employee_protected_status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "status_type" TEXT NOT NULL,
    "effective_start_date" DATE NOT NULL,
    "effective_end_date" DATE,
    "declared_by" UUID NOT NULL,
    "declared_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_protected_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_protected_status_employee_id_status_type_effective_idx" ON "employee_protected_status"("employee_id", "status_type", "effective_start_date");

-- AddForeignKey
ALTER TABLE "employee_protected_status" ADD CONSTRAINT "employee_protected_status_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_protected_status" ADD CONSTRAINT "employee_protected_status_declared_by_fkey" FOREIGN KEY ("declared_by") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

