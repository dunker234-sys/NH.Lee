import { Module } from '@nestjs/common';
import { SchedulePolicyModule } from '../../common/policy/schedule-policy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RosterGenerationController } from './roster-generation.controller';
import { RosterGenerationService } from './roster-generation.service';
import { ScheduleAggregationService } from './schedule-aggregation.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleExcelController } from './schedule-excel.controller';
import { ScheduleExcelService } from './schedule-excel.service';
import { ScheduleMeController } from './schedule-me.controller';
import { ScheduleMeService } from './schedule-me.service';
import { ScheduleReportController } from './schedule-report.controller';
import { ScheduleReportService } from './schedule-report.service';
import { ScheduleRepository } from './schedule.repository';
import { ScheduleService } from './schedule.service';
import { ScheduleValidationService } from './schedule-validation.service';
import { ShiftTemplateController } from './shift-template.controller';
import { ShiftTemplateRepository } from './shift-template.repository';
import { ShiftTemplateService } from './shift-template.service';

@Module({
  imports: [SchedulePolicyModule, NotificationsModule],
  controllers: [
    ShiftTemplateController,
    ScheduleController,
    RosterGenerationController,
    ScheduleReportController,
    ScheduleMeController,
    ScheduleExcelController,
  ],
  providers: [
    ShiftTemplateRepository,
    ShiftTemplateService,
    ScheduleRepository,
    ScheduleService,
    ScheduleAggregationService,
    ScheduleValidationService,
    RosterGenerationService,
    ScheduleReportService,
    ScheduleMeService,
    ScheduleExcelService,
  ],
})
export class ScheduleModule {}
