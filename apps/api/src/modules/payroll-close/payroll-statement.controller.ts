import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollStatementComputationService } from './payroll-statement-computation.service';
import { PayrollCloseNotFoundError } from './errors/payroll-close-errors';

@ApiTags('payroll-close')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/payroll-close/:siteId/:yearMonth/statement')
export class PayrollStatementController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly computation: PayrollStatementComputationService,
  ) {}

  /** 미저장 미리보기 — 아직 제출(submit)하지 않은 상태에서도 산출 결과를 확인할 수 있다. */
  @Get('preview')
  async preview(@CurrentOrgScope() scope: OrgScope, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.computation.compute(siteId, yearMonth);
  }

  /** 실제 산출 + 저장. submit 이후(PayrollClose 행 존재)에만 호출 가능하다. */
  @Post('compute')
  async compute(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const close = await this.prisma.payrollClose.findUnique({ where: { siteId_periodYearMonth: { siteId, periodYearMonth: yearMonth } } });
    if (!close) throw new PayrollCloseNotFoundError(siteId, yearMonth);

    const lines = await this.computation.compute(siteId, yearMonth);
    const batchType = close.version > 1 || (await this.prisma.payrollStatementItem.count({ where: { payrollCloseId: close.id } })) > 0 ? 'RECLOSE' : 'INITIAL_CLOSE';
    const result = await this.computation.persist(close.id, siteId, yearMonth, lines, principal.employeeId, batchType, close.version);
    return { lineCount: lines.length, ...result };
  }

  @Get()
  async list(@CurrentOrgScope() scope: OrgScope, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const close = await this.prisma.payrollClose.findUnique({ where: { siteId_periodYearMonth: { siteId, periodYearMonth: yearMonth } } });
    if (!close) throw new PayrollCloseNotFoundError(siteId, yearMonth);
    return this.prisma.payrollStatementItem.findMany({
      where: { payrollCloseId: close.id },
      include: { employee: { select: { employeeNo: true, name: true } } },
      orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
    });
  }

  @Get(':employeeId')
  async byEmployee(
    @CurrentOrgScope() scope: OrgScope,
    @Param('siteId') siteId: string,
    @Param('yearMonth') yearMonth: string,
    @Param('employeeId') employeeId: string,
  ) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const close = await this.prisma.payrollClose.findUnique({ where: { siteId_periodYearMonth: { siteId, periodYearMonth: yearMonth } } });
    if (!close) throw new PayrollCloseNotFoundError(siteId, yearMonth);
    return this.prisma.payrollStatementItem.findMany({
      where: { payrollCloseId: close.id, employeeId },
      orderBy: { workDate: 'asc' },
    });
  }
}
