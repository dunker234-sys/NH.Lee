import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('hq')
  @Roles('REGIONAL', 'HQ_HR', 'ADMIN')
  @ApiOperation({ summary: '본사 대시보드 — 사업장 현황, 출근률, 위험 인원 등(요구사항서 4.4⑤)' })
  getHq(@CurrentOrgScope() scope: OrgScope) {
    return this.dashboardService.getHqDashboard(scope);
  }

  @Get('site/:siteId')
  @Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
  @ApiOperation({ summary: '사업장 대시보드(요구사항서 4.4⑤)' })
  getSite(@CurrentOrgScope() scope: OrgScope, @Param('siteId') siteId: string) {
    return this.dashboardService.getSiteDashboard(scope, siteId);
  }
}
