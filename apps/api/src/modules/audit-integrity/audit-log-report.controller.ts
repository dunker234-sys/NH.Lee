import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { AuditLogReportService } from './audit-log-report.service';

/** 요구사항5 "조회 화면: 기간·사업장·근로자·행위자 필터, 엑셀 내보내기".
 * 2026-09 수정사항으로 "프로그램 관리자"(ADMIN) 전용으로 재분류. */
@ApiTags('audit')
@Roles('ADMIN')
@Controller('admin/audit/log')
export class AuditLogReportController {
  constructor(private readonly service: AuditLogReportService) {}

  @Get()
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'siteId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'actorPrincipal', required: false })
  @ApiQuery({ name: 'eventType', required: false })
  @ApiQuery({ name: 'page', required: false })
  list(
    @CurrentOrgScope() scope: OrgScope,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('siteId') siteId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('actorPrincipal') actorPrincipal?: string,
    @Query('eventType') eventType?: string,
    @Query('page') page?: string,
  ) {
    return this.service.query(scope, { from, to, siteId, employeeId, actorPrincipal, eventType, page: page ? Number(page) : undefined });
  }

  @Get('export')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'siteId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'actorPrincipal', required: false })
  @ApiQuery({ name: 'eventType', required: false })
  async export(
    @CurrentOrgScope() scope: OrgScope,
    @Res() res: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('siteId') siteId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('actorPrincipal') actorPrincipal?: string,
    @Query('eventType') eventType?: string,
  ) {
    const buf = await this.service.exportWorkbook(scope, { from, to, siteId, employeeId, actorPrincipal, eventType });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="audit-log.xlsx"',
    });
    res.send(buf);
  }
}
