import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { CutoverApprovalService } from './cutover-approval.service';
import { SetCutoverDateDto } from './dto/set-cutover-date.dto';
import { SiteIdDto } from './dto/site-id.dto';
import { SiteCutoverService } from './site-cutover.service';

@ApiTags('migration')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/migration/cutover')
export class SiteCutoverController {
  constructor(
    private readonly service: SiteCutoverService,
    private readonly approvalService: CutoverApprovalService,
  ) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: true })
  get(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string) {
    return this.service.get(scope, siteId);
  }

  @Post()
  setCutoverDate(@CurrentOrgScope() scope: OrgScope, @Body() dto: SetCutoverDateDto) {
    return this.service.setCutoverDate(scope, dto.siteId, dto.cutoverDate);
  }

  /** ★ HQ_HR/ADMIN만 승인 가능 — @Roles는 클래스 레벨(전체 관리자)이라
   * 여기서만 좁힌다(개통 승인은 조직도상 사업장 관리자가 아니라 본사 몫). */
  @Roles('HQ_HR', 'ADMIN')
  @Post('approve')
  approve(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: SiteIdDto) {
    return this.approvalService.approve(scope, principal, dto.siteId);
  }
}
