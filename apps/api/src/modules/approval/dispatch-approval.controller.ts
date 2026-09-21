import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { DispatchStatus } from '@prisma/client';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { ApproveRejectDto } from './dto/approve-reject.dto';
import { DispatchApprovalService } from './dispatch-approval.service';

@ApiTags('approval')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/approval/dispatch-requests')
export class DispatchApprovalController {
  constructor(private readonly service: DispatchApprovalService) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId?: string, @Query('status') status?: DispatchStatus) {
    return this.service.list(scope, { siteId, status });
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
