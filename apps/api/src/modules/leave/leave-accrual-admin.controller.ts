import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { AnnualLeaveAccrualService } from './annual-leave-accrual.service';
import { RunAccrualBatchDto } from './dto/run-accrual-batch.dto';

@ApiTags('leave')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/leave/accrual')
export class LeaveAccrualAdminController {
  constructor(private readonly service: AnnualLeaveAccrualService) {}

  @Post('run')
  @ApiOperation({ summary: '수동/테스트 트리거 — 자동 스케줄링은 파일럿 검증 후 별도 후속 작업' })
  run(@CurrentOrgScope() scope: OrgScope, @Body() dto: RunAccrualBatchDto) {
    return this.service.run(scope, dto.asOfDate, dto.siteId);
  }
}
