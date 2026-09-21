import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { OpsMonitoringService } from './ops-monitoring.service';

@ApiTags('ops-monitoring')
@Roles('HQ_HR', 'ADMIN')
@Controller('admin/ops/monitoring')
export class OpsMonitoringController {
  constructor(private readonly service: OpsMonitoringService) {}

  @Get()
  @ApiOperation({
    summary: 'STEP12 운영 모니터링 — 타각 실패율·미등록 건수·배치 성공률·알림 발송 성공률·미승인 실적 미판정 건수·DLQ 적체',
  })
  getSummary() {
    return this.service.getSummary();
  }
}
