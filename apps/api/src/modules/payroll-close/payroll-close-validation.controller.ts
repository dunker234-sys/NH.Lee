import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PayrollCloseValidationService } from './payroll-close-validation.service';

class AcknowledgeReportDto {
  @IsString()
  reportId!: string;
}

@ApiTags('payroll-close')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/payroll-close/:siteId/:yearMonth/validation')
export class PayrollCloseValidationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: PayrollCloseValidationService,
  ) {}

  @Post('run')
  async run(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.validation.runValidation(siteId, yearMonth, principal.employeeId);
  }

  @Get('latest')
  async latest(@CurrentOrgScope() scope: OrgScope, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.prisma.payrollCloseValidationReport.findFirst({
      where: { siteId, periodYearMonth: yearMonth },
      include: { findings: true },
      orderBy: { generatedAt: 'desc' },
    });
  }

  @Post('acknowledge')
  async acknowledge(
    @CurrentOrgScope() scope: OrgScope,
    @CurrentPrincipal() principal: EmployeePrincipal,
    @Param('siteId') siteId: string,
    @Body() dto: AcknowledgeReportDto,
  ) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    await this.validation.acknowledge(dto.reportId, principal.employeeId);
    return { acknowledged: true };
  }
}
