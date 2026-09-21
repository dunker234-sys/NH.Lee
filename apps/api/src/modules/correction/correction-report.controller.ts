import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CorrectionRequestSource, CorrectionStatus } from '@prisma/client';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { CorrectionRequestService } from './correction-request.service';

/**
 * requestSource=ADMIN_DIRECT로 필터하면 그대로 "직권 정정 전량 추적
 * 리포트"(요구사항 4.7-4)가 된다 — 별도 테이블/엔드포인트를 만들지 않는다.
 */
@ApiTags('correction')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/correction/report')
export class CorrectionReportController {
  constructor(private readonly service: CorrectionRequestService) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'requestSource', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  report(
    @CurrentOrgScope() scope: OrgScope,
    @Query('siteId') siteId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: CorrectionStatus,
    @Query('requestSource') requestSource?: CorrectionRequestSource,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listForApproval(scope, { siteId, employeeId, status, requestSource, from, to });
  }
}
