import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OvertimeRequestStatus } from '@prisma/client';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { ApproveRejectDto } from './dto/approve-reject.dto';
import { BulkApproveOvertimeDto } from './dto/bulk-approve-overtime.dto';
import { OvertimeApprovalService } from './overtime-approval.service';

@ApiTags('approval')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/approval/overtime-requests')
export class OvertimeApprovalController {
  constructor(private readonly service: OvertimeApprovalService) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  list(
    @CurrentOrgScope() scope: OrgScope,
    @Query('siteId') siteId?: string,
    @Query('status') status?: OvertimeRequestStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list(scope, { siteId, status, from, to });
  }

  @Get('unapproved-actuals')
  @ApiOperation({ summary: '일괄 승인 소스 — AttendanceDaily.status=UNAPPROVED_ACTUAL 목록' })
  @ApiQuery({ name: 'siteId', required: true })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  unapprovedActuals(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.service.unapprovedActuals(scope, siteId, from, to);
  }

  @Post('bulk-approve')
  @ApiOperation({ summary: '미승인 실적 목록에서 다중 선택 승인 — 사후 신청 생성과 승인을 한 번에 처리' })
  bulkApprove(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: BulkApproveOvertimeDto) {
    return this.service.bulkApprove(scope, principal, dto);
  }

  @Post(':id/approve')
  approve(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string, @Body() dto: ApproveRejectDto) {
    return this.service.approve(scope, principal, id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string, @Body() dto: ApproveRejectDto) {
    return this.service.reject(scope, principal, id, dto);
  }
}
