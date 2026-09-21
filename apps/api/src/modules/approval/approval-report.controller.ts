import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { ApprovalReportService } from './approval-report.service';

@ApiTags('approval')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/approval/reports')
export class ApprovalReportController {
  constructor(private readonly service: ApprovalReportService) {}

  @Get('unapproved-overtime')
  @ApiOperation({ summary: 'siteId 지정 시 직원별 breakdown, 생략 시 사업장별 롤업(승인 절차 미운영 사업장 식별용)' })
  @ApiQuery({ name: 'yearMonth', required: true, description: 'YYYY-MM' })
  @ApiQuery({ name: 'siteId', required: false })
  report(@CurrentOrgScope() scope: OrgScope, @Query('yearMonth') yearMonth: string, @Query('siteId') siteId?: string) {
    return this.service.unapprovedOvertimeReport(scope, yearMonth, siteId);
  }
}
