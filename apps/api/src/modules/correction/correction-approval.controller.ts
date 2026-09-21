import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CorrectionStatus } from '@prisma/client';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { ApproveRejectDto } from '../approval/dto/approve-reject.dto';
import { CorrectionApprovalService } from './correction-approval.service';
import { CorrectionRequestService } from './correction-request.service';

@ApiTags('correction')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/correction/requests')
export class CorrectionApprovalController {
  constructor(
    private readonly approvalService: CorrectionApprovalService,
    private readonly requestService: CorrectionRequestService,
  ) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId?: string, @Query('status') status?: CorrectionStatus) {
    return this.requestService.listForApproval(scope, { siteId, status });
  }

  @Post(':id/approve')
  approve(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string, @Body() dto: ApproveRejectDto) {
    return this.approvalService.approve(scope, principal, id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string, @Body() dto: ApproveRejectDto) {
    return this.approvalService.reject(scope, principal, id, dto);
  }
}
