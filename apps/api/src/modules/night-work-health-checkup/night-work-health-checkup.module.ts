import { Module } from '@nestjs/common';
import { NightWorkHealthCheckupPolicyModule } from '../../common/policy/night-work-health-checkup-policy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NightWorkHealthCheckupBatchService } from './night-work-health-checkup-batch.service';
import { NightWorkHealthCheckupController } from './night-work-health-checkup.controller';
import { NightWorkHealthCheckupReportService } from './night-work-health-checkup-report.service';

@Module({
  imports: [NightWorkHealthCheckupPolicyModule, NotificationsModule],
  controllers: [NightWorkHealthCheckupController],
  providers: [NightWorkHealthCheckupBatchService, NightWorkHealthCheckupReportService],
  exports: [NightWorkHealthCheckupBatchService, NightWorkHealthCheckupReportService],
})
export class NightWorkHealthCheckupModule {}
