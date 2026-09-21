/*
  Warnings:

  - You are about to drop the column `status_type` on the `employee_protected_status` table. All the data in the column will be lost.
  - Added the required column `status_type_encrypted` to the `employee_protected_status` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "employee_protected_status_employee_id_status_type_effective_idx";

-- AlterTable
ALTER TABLE "employee_protected_status" DROP COLUMN "status_type",
ADD COLUMN     "status_type_encrypted" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "employee_protected_status_employee_id_effective_start_date_idx" ON "employee_protected_status"("employee_id", "effective_start_date");
