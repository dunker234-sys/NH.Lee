import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentOrgScope, CurrentPrincipal } from '../../../common/decorators/current-principal.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../../common/principal/principal.types';
import { OrgScope } from '../../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../../common/scope/scope.util';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PayrollExportService } from './payroll-export.service';
import { ExportPayrollCloseDto } from './dto/export-payroll-close.dto';

const CONTENT_TYPES: Record<'EXCEL' | 'CSV', string> = {
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  CSV: 'text/csv; charset=utf-8',
};

@ApiTags('payroll-close')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/payroll-close/:siteId/:yearMonth/export')
export class PayrollExportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exportService: PayrollExportService,
  ) {}

  @Post()
  async export(
    @CurrentOrgScope() scope: OrgScope,
    @CurrentPrincipal() principal: EmployeePrincipal,
    @Param('siteId') siteId: string,
    @Param('yearMonth') yearMonth: string,
    @Body() dto: ExportPayrollCloseDto,
    @Res() res: Response,
  ) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const result = await this.exportService.exportClose(siteId, yearMonth, dto.format, principal.employeeId, dto.columnMappingId);
    res.set({
      'Content-Type': CONTENT_TYPES[result.format],
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    });
    res.send(result.buffer);
  }

  @Get('history')
  async history(@CurrentOrgScope() scope: OrgScope, @Param('siteId') siteId: string, @Param('yearMonth') yearMonth: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.prisma.payrollExportRecord.findMany({
      where: { siteId, periodYearMonth: yearMonth },
      orderBy: { exportedAt: 'desc' },
    });
  }
}
