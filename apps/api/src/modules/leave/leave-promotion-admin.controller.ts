import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { RecordPromotionResponseDto } from './dto/record-promotion-response.dto';
import { RunPromotionBatchDto } from './dto/run-promotion-batch.dto';
import { LeavePromotionComplianceService } from './leave-promotion-compliance.service';
import { LeavePromotionResponseService } from './leave-promotion-response.service';
import { LeavePromotionService } from './leave-promotion.service';

@ApiTags('leave')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/leave/promotion')
export class LeavePromotionAdminController {
  constructor(
    private readonly promotionService: LeavePromotionService,
    private readonly responseService: LeavePromotionResponseService,
    private readonly complianceService: LeavePromotionComplianceService,
  ) {}

  @Post('run')
  @ApiOperation({ summary: '수동/테스트 트리거 — 자동 스케줄링은 파일럿 검증 후 별도 후속 작업' })
  run(@CurrentOrgScope() scope: OrgScope, @Body() dto: RunPromotionBatchDto) {
    return this.promotionService.run(scope, dto.asOfDate, dto.siteId);
  }

  @Post(':logId/record-response')
  recordResponse(@Param('logId') logId: string, @Body() dto: RecordPromotionResponseDto) {
    return this.responseService.record(logId, dto);
  }

  @Get('compliance')
  @ApiQuery({ name: 'leaveBalanceId', required: true })
  compliance(@Query('leaveBalanceId') leaveBalanceId: string) {
    return this.complianceService.check(leaveBalanceId);
  }
}
