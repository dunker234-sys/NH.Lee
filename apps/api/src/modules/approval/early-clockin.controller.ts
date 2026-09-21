import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { DetectEarlyClockInDto } from './dto/detect-early-clockin.dto';
import { EarlyClockInPatternService } from './early-clockin-pattern.service';

@ApiTags('approval')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/approval/early-clock-in')
export class EarlyClockInController {
  constructor(private readonly service: EarlyClockInPatternService) {}

  @Post('detect')
  @ApiOperation({ summary: '수동/테스트 트리거 — 자동 월간 스케줄링은 파일럿 검증 후 별도 후속 작업' })
  detect(@CurrentOrgScope() scope: OrgScope, @Body() dto: DetectEarlyClockInDto) {
    return this.service.detectForMonth(scope, dto.siteId, dto.yearMonth);
  }
}
