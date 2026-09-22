import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { ScheduleReportService } from './schedule-report.service';

@ApiTags('schedule')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/schedule/reports')
export class ScheduleReportController {
  constructor(private readonly service: ScheduleReportService) {}

  @Get('schedule-vs-actual')
  @ApiQuery({ name: 'siteId', required: true })
  @ApiQuery({ name: 'yearMonth', required: true, description: 'YYYY-MM' })
  scheduleVsActual(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string, @Query('yearMonth') yearMonth: string) {
    return this.service.scheduleVsActual(scope, siteId, yearMonth);
  }

  @Get('actual')
  @ApiQuery({ name: 'siteId', required: true })
  @ApiQuery({ name: 'yearMonth', required: true, description: 'YYYY-MM' })
  actualReport(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string, @Query('yearMonth') yearMonth: string) {
    return this.service.actualReport(scope, siteId, yearMonth);
  }
}
