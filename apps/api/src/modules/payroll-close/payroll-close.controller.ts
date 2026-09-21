import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollCloseGuardService } from './payroll-close-guard.service';
import { PayrollCloseStageService } from './payroll-close-stage.service';
import { ReopenPayrollCloseDto } from './dto/reopen-payroll-close.dto';
import { PayrollCloseNotFoundError } from './errors/payroll-close-errors';

@ApiTags('payroll-close')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/payroll-close/:siteId/:yearMonth')
export class PayrollCloseController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: PayrollCloseGuardService,
    private readonly stage: PayrollCloseStageService,
  ) {}

  @Get('readiness')
  async readiness(@CurrentOrgScope() scope: OrgScope, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.guard.readiness(siteId, yearMonth);
  }

  @Get()
  async get(@CurrentOrgScope() scope: OrgScope, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const close = await this.prisma.payrollClose.findUnique({ where: { siteId_periodYearMonth: { siteId, periodYearMonth: yearMonth } } });
    if (!close) throw new PayrollCloseNotFoundError(siteId, yearMonth);
    return close;
  }

  @Post('submit')
  async submit(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.stage.submitAtSite(siteId, yearMonth, principal.employeeId, principal.role);
  }

  @Post('approve')
  async approve(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.stage.approveAtRegion(siteId, yearMonth, principal.employeeId, principal.role);
  }

  @Post('finalize')
  async finalize(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.stage.finalizeAtHq(siteId, yearMonth, principal.employeeId, principal.role);
  }

  @Post('reopen')
  async reopen(
    @CurrentOrgScope() scope: OrgScope,
    @CurrentPrincipal() principal: EmployeePrincipal,
    @Param('siteId') siteId: string,
    @Param('yearMonth') yearMonth: string,
    @Body() dto: ReopenPayrollCloseDto,
  ) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.stage.reopen(siteId, yearMonth, principal.employeeId, principal.role, dto.reason);
  }

  @Get('diff')
  @ApiQuery({ name: 'fromVersion', required: false })
  @ApiQuery({ name: 'toVersion', required: false })
  async diff(
    @CurrentOrgScope() scope: OrgScope,
    @Param('siteId') siteId: string,
    @Param('yearMonth') yearMonth: string,
    @Query('fromVersion') fromVersion?: string,
    @Query('toVersion') toVersion?: string,
  ) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const close = await this.prisma.payrollClose.findUnique({ where: { siteId_periodYearMonth: { siteId, periodYearMonth: yearMonth } } });
    if (!close) throw new PayrollCloseNotFoundError(siteId, yearMonth);

    const batches = await this.prisma.payrollCloseBatch.findMany({
      where: {
        payrollCloseId: close.id,
        version: {
          gte: fromVersion ? Number(fromVersion) : undefined,
          lte: toVersion ? Number(toVersion) : undefined,
        },
      },
      include: { rows: { include: { employee: { select: { employeeNo: true, name: true } } } } },
      orderBy: { version: 'asc' },
    });
    return batches;
  }
}
