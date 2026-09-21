-- CreateEnum
CREATE TYPE "SiteVerificationSignalType" AS ENUM ('NFC_TAG', 'WIFI_BSSID', 'CELL_ID');

-- CreateEnum
CREATE TYPE "FraudSignalType" AS ENUM ('IMPOSSIBLE_TRAVEL_SPEED', 'REPEATED_EXACT_COORDINATES', 'SHARED_DEVICE_MULTIPLE_EMPLOYEES');

-- AlterTable
ALTER TABLE "punch_raw" ADD COLUMN     "review_note" TEXT;

-- AlterTable
ALTER TABLE "site" ADD COLUMN     "qr_totp_secret_encrypted" TEXT,
ADD COLUMN     "qr_totp_secret_updated_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "site_verification_signal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "signal_type" "SiteVerificationSignalType" NOT NULL,
    "value" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_verification_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_fraud_signal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "punch_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "signal_type" "FraudSignalType" NOT NULL,
    "detail" JSONB NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punch_fraud_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "no_show_notification_target" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "schedule_id" UUID NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMPTZ(6),

    CONSTRAINT "no_show_notification_target_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_verification_signal_site_id_signal_type_value_key" ON "site_verification_signal"("site_id", "signal_type", "value");

-- CreateIndex
CREATE INDEX "punch_fraud_signal_punch_id_idx" ON "punch_fraud_signal"("punch_id");

-- CreateIndex
CREATE INDEX "punch_fraud_signal_employee_id_detected_at_idx" ON "punch_fraud_signal"("employee_id", "detected_at");

-- CreateIndex
CREATE INDEX "no_show_notification_target_site_id_work_date_idx" ON "no_show_notification_target"("site_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "no_show_notification_target_employee_id_work_date_key" ON "no_show_notification_target"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "punch_raw_employee_id_recorded_at_idx" ON "punch_raw"("employee_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "punch_raw_device_id_received_at_idx" ON "punch_raw"("device_id", "received_at");

-- AddForeignKey
ALTER TABLE "site_verification_signal" ADD CONSTRAINT "site_verification_signal_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_fraud_signal" ADD CONSTRAINT "punch_fraud_signal_punch_id_fkey" FOREIGN KEY ("punch_id") REFERENCES "punch_raw"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_show_notification_target" ADD CONSTRAINT "no_show_notification_target_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_show_notification_target" ADD CONSTRAINT "no_show_notification_target_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_show_notification_target" ADD CONSTRAINT "no_show_notification_target_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
