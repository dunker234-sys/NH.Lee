import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { LeaveRequestStatus } from '@prisma/client';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { LeaveApproveDto } from './dto/leave-approve.dto';
import { LeaveRejectDto } from './dto/leave-reject.dto';
import { LeaveRequestApprovalService } from './leave-request-approval.service';

@ApiTags('leave')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/leave/requests')
export class LeaveRequestApprovalController {
  constructor(private readonly service: LeaveRequestApprovalService) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId?: string, @Query('status') status?: LeaveRequestStatus) {
    return this.service.list(scope, { siteId, status });
  }

  @Post(':id/approve')
  approve(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string, @Body() dto: LeaveApproveDto) {
    return this.service.approve(scope, principal, id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string, @Body() dto: LeaveRejectDto) {
    return this.service.reject(scope, principal, id, dto);
  }

  @Post(':id/approve-cancellation')
  approveCancellation(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string) {
    return this.service.approveCancellation(scope, principal, id);
  }

  @Post(':id/reject-cancellation')
  rejectCancellation(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string) {
    return this.service.rejectCancellation(scope, principal, id);
  }
}
