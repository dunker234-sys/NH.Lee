import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuditIntegrityController } from './audit-integrity.controller';
import { AuditIntegrityVerifyService } from './audit-integrity-verify.service';
import { AuditLogReportController } from './audit-log-report.controller';
import { AuditLogReportService } from './audit-log-report.service';
import { AuditMerkleSealConsumer } from './audit-merkle-seal.consumer';
import { AuditMerkleSealScheduleService } from './audit-merkle-seal-schedule.service';
import { AuditMerkleSealService } from './audit-merkle-seal.service';
import { AUDIT_MERKLE_SEAL_QUEUE_NAME } from './queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: AUDIT_MERKLE_SEAL_QUEUE_NAME,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 500 } },
    }),
  ],
  controllers: [AuditIntegrityController, AuditLogReportController],
  providers: [AuditMerkleSealService, AuditMerkleSealConsumer, AuditMerkleSealScheduleService, AuditIntegrityVerifyService, AuditLogReportService],
  exports: [AuditMerkleSealService, AuditIntegrityVerifyService],
})
export class AuditIntegrityModule {}
