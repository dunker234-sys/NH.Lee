-- CreateEnum
CREATE TYPE "AlertLogChannel" AS ENUM ('PUSH', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "AlertLogResult" AS ENUM ('PENDING', 'SUCCESS', 'FAILED_RETRYING', 'FAILED_FINAL', 'SUPPRESSED');

-- AlterEnum
ALTER TYPE "ConsentType" ADD VALUE 'NOTIFICATION';

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'ko';

-- CreateTable
CREATE TABLE "alert_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_type" TEXT NOT NULL,
    "channel" "AlertLogChannel" NOT NULL,
    "recipient_employee_id" UUID NOT NULL,
    "target_period" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT 'DEFAULT',
    "dedup_key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "result" "AlertLogResult" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "settled_at" TIMESTAMPTZ(6),

    CONSTRAINT "alert_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_log_dedup_key_key" ON "alert_log"("dedup_key");

-- CreateIndex
CREATE INDEX "alert_log_recipient_employee_id_requested_at_idx" ON "alert_log"("recipient_employee_id", "requested_at");

-- CreateIndex
CREATE INDEX "alert_log_notification_type_result_idx" ON "alert_log"("notification_type", "result");

-- CreateIndex
CREATE UNIQUE INDEX "device_token_employee_id_device_id_platform_key" ON "device_token"("employee_id", "device_id", "platform");

-- AddForeignKey
ALTER TABLE "alert_log" ADD CONSTRAINT "alert_log_recipient_employee_id_fkey" FOREIGN KEY ("recipient_employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

