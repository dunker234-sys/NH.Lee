import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { dateOnly } from '../../common/time/week.util';
import { ApprovalLineResolverService } from './approval-line-resolver.service';

/** 디버깅/향후 admin-web용 조회 엔드포인트 — 결재선 자체는 인가 게이트가
 * 아니라 알림 라우팅 전용이다(§Context). */
@ApiTags('approval')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/approval/approval-line')
export class ApprovalLineController {
  constructor(private readonly resolver: ApprovalLineResolverService) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: true })
  @ApiQuery({ name: 'asOfDate', required: false, description: 'YYYY-MM-DD, 기본값 오늘' })
  resolve(@Query('siteId') siteId: string, @Query('asOfDate') asOfDate?: string) {
    const date = asOfDate ? dateOnly(asOfDate) : new Date();
    return this.resolver.resolveApprovers(siteId, date);
  }
}
