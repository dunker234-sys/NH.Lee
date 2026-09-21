import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { ComplianceReportsController } from './compliance-reports.controller';
import { EarlyClockInReportService } from './early-clockin-report.service';
import { NoShowReportService } from './no-show-report.service';
import { OvertimeStatsService } from './overtime-stats.service';

@Module({
  imports: [ApprovalModule],
  controllers: [ComplianceReportsController],
  providers: [NoShowReportService, EarlyClockInReportService, OvertimeStatsService],
})
export class ComplianceReportsModule {}
