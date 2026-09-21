import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { PayrollCloseGuardService } from './payroll-close-guard.service';

@ApiTags('approval')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/approval/payroll-close/readiness')
export class PayrollCloseReadinessController {
  constructor(private readonly guard: PayrollCloseGuardService) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: true })
  @ApiQuery({ name: 'yearMonth', required: true, description: 'YYYY-MM' })
  async readiness(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string, @Query('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const unresolvedCount = await this.guard.unresolvedCount(siteId, yearMonth);
    return { blocked: unresolvedCount > 0, unresolvedCount };
  }
}
