import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { LeaveBalanceService } from './leave-balance.service';

/** 재직자 연차 현황(수정사항: 연차 배치 관리 화면 목적 변경). */
@ApiTags('leave')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/leave/balances')
export class LeaveBalanceAdminController {
  constructor(private readonly service: LeaveBalanceService) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: true })
  @ApiQuery({ name: 'asOfDate', required: true, description: 'YYYY-MM-DD' })
  @ApiOperation({ summary: '재직(ACTIVE) 직원 전원의 asOfDate 기준 연차 잔액' })
  list(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string, @Query('asOfDate') asOfDate: string) {
    return this.service.listActiveEmployeeBalances(scope, siteId, asOfDate);
  }
}
