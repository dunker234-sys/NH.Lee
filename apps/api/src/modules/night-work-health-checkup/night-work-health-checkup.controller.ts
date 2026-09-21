import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { RecalculateNightWorkHealthCheckupDto } from './dto/recalculate-night-work-health-checkup.dto';
import { NightWorkHealthCheckupBatchService } from './night-work-health-checkup-batch.service';
import { NightWorkHealthCheckupReportService } from './night-work-health-checkup-report.service';

@ApiTags('compliance')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/compliance-reports/night-work-health-checkup')
export class NightWorkHealthCheckupController {
  constructor(
    private readonly batchService: NightWorkHealthCheckupBatchService,
    private readonly reportService: NightWorkHealthCheckupReportService,
  ) {}

  @Get()
  @ApiOperation({ summary: '야간작업 특수건강진단 대상자 목록(산안법 §130, 시행규칙 별표22 제4호) — 사전 계산된 결과만 조회' })
  @ApiQuery({ name: 'siteId', required: false })
  list(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId?: string) {
    return this.reportService.listTargets(scope, siteId);
  }

  @Post('recalculate')
  @ApiOperation({ summary: '수동/시스템 배치 트리거 — 자동 월간 스케줄링은 파일럿 검증 후 별도 후속 작업(EarlyClockInPatternService와 같은 결정)' })
  recalculate(@CurrentOrgScope() scope: OrgScope, @Body() dto: RecalculateNightWorkHealthCheckupDto) {
    assertScope(scope);
    if (dto.siteId) assertSiteInScope(scope, dto.siteId);
    const siteIds = dto.siteId ? [dto.siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;
    return this.batchService.recalculateForAllActiveEmployees(dto.asOfDate, siteIds);
  }
}
