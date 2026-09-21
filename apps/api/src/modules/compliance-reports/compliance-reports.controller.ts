import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { ApprovalReportService } from '../approval/approval-report.service';
import { EarlyClockInReportService } from './early-clockin-report.service';
import { NoShowReportService } from './no-show-report.service';
import { OvertimeStatsService } from './overtime-stats.service';

/**
 * 요구사항서 4.4④ 준법 리포트 화면 하나가 쓰는 4개 하위 데이터 소스를
 * 한 컨트롤러 아래 모은다. 미승인 실적 미판정 건수는 STEP6.5가 이미
 * 만든 ApprovalReportService.unapprovedOvertimeReport()를 그대로
 * 재사용한다 — "미승인 실적 미판정" == "unapprovedOvertimeReport의
 * status='UNAPPROVED_ACTUAL'" 그 자체다(승인되거나 판정되면 그 상태를
 * 벗어난다). 야간작업 특수건강진단은 별도 모듈(night-work-health-checkup)
 * 소관이라 여기서 다루지 않는다.
 */
@ApiTags('compliance')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/compliance-reports')
export class ComplianceReportsController {
  constructor(
    private readonly noShowReportService: NoShowReportService,
    private readonly earlyClockInReportService: EarlyClockInReportService,
    private readonly approvalReportService: ApprovalReportService,
    private readonly overtimeStatsService: OvertimeStatsService,
  ) {}

  @Get('no-show')
  @ApiOperation({ summary: '미등록(누락) 감지 결과' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'siteId', required: false })
  noShow(@CurrentOrgScope() scope: OrgScope, @Query('from') from: string, @Query('to') to: string, @Query('siteId') siteId?: string) {
    return this.noShowReportService.list(scope, from, to, siteId);
  }

  @Get('early-clockin')
  @ApiOperation({ summary: '조기 출근 반복 패턴(동일 근로자 월 N회 이상)' })
  @ApiQuery({ name: 'yearMonth', required: false, description: 'YYYY-MM, 생략 시 전체' })
  @ApiQuery({ name: 'siteId', required: false })
  earlyClockIn(@CurrentOrgScope() scope: OrgScope, @Query('yearMonth') yearMonth?: string, @Query('siteId') siteId?: string) {
    return this.earlyClockInReportService.list(scope, yearMonth, siteId);
  }

  @Get('unapproved-unjudged')
  @ApiOperation({ summary: '미승인 실적 미판정 건수(사업장별) — STEP6.5 ApprovalReportService 재사용' })
  @ApiQuery({ name: 'yearMonth', required: true, description: 'YYYY-MM' })
  @ApiQuery({ name: 'siteId', required: false })
  unapprovedUnjudged(@CurrentOrgScope() scope: OrgScope, @Query('yearMonth') yearMonth: string, @Query('siteId') siteId?: string) {
    return this.approvalReportService.unapprovedOvertimeReport(scope, yearMonth, siteId);
  }

  @Get('overtime-stats/site-comparison')
  @ApiOperation({ summary: '월/분기 초과근로 사업장별 비교' })
  @ApiQuery({ name: 'period', required: true, description: 'YYYY-MM 또는 YYYY-Qn' })
  siteComparison(@CurrentOrgScope() scope: OrgScope, @Query('period') period: string) {
    return this.overtimeStatsService.getSiteComparison(scope, period);
  }

  @Get('overtime-stats/violation-history')
  @ApiOperation({ summary: '위반 이력(감독 대응용)' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'siteId', required: false })
  violationHistory(
    @CurrentOrgScope() scope: OrgScope,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.overtimeStatsService.getViolationHistory(scope, from, to, siteId);
  }

  @Get('overtime-stats/violation-history/export')
  @ApiOperation({ summary: '위반 이력 엑셀 내보내기' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'siteId', required: false })
  async exportViolationHistory(
    @CurrentOrgScope() scope: OrgScope,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
    @Query('siteId') siteId?: string,
  ) {
    const buffer = await this.overtimeStatsService.exportViolationHistoryWorkbook(scope, from, to, siteId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="violation-history-${from}_${to}.xlsx"`,
    });
    res.send(buffer);
  }
}
