-- CreateEnum
CREATE TYPE "KioskDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "employee_credential" ADD COLUMN     "pin_failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pin_hash" TEXT,
ADD COLUMN     "pin_locked_until" TIMESTAMPTZ(6),
ADD COLUMN     "pin_set_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "kiosk_device" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "credential_hash" TEXT NOT NULL,
    "status" "KioskDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "paired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_ip_allowlist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "cidr" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_ip_allowlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_device_credential_hash_key" ON "kiosk_device"("credential_hash");

-- CreateIndex
CREATE INDEX "kiosk_device_site_id_idx" ON "kiosk_device"("site_id");

-- CreateIndex
CREATE INDEX "site_ip_allowlist_site_id_active_idx" ON "site_ip_allowlist"("site_id", "active");

-- AddForeignKey
ALTER TABLE "kiosk_device" ADD CONSTRAINT "kiosk_device_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_ip_allowlist" ADD CONSTRAINT "site_ip_allowlist_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

