import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CursorPageQueryDto } from '../../common/dto/cursor-page-query.dto';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { AlertLogRepository } from './alert-log.repository';

const DEFAULT_LIMIT = 50;

/**
 * STEP5-A: 본인 알림 이력 조회. dedupKey 등 내부 필드는 투영에서 제외한다
 * (device-tokens 컨트롤러가 이미 확립한 "narrow projection" 원칙).
 */
@ApiTags('alert-log')
@Controller('alert-log')
export class AlertLogController {
  constructor(private readonly repo: AlertLogRepository) {}

  @Get()
  @ApiOperation({ summary: '본인 알림 발송 이력(self-scoped, requestedAt DESC 커서 페이지네이션)' })
  async list(@CurrentPrincipal() principal: EmployeePrincipal, @Query() query: CursorPageQueryDto) {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const rows = await this.repo.findByRecipient(principal.employeeId, query.before ? new Date(query.before) : undefined, limit + 1);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
      id: r.id,
      notificationType: r.notificationType,
      channel: r.channel,
      result: r.result,
      requestedAt: r.requestedAt,
      sentAt: r.sentAt,
      payload: r.payload,
      locale: r.locale,
    }));
    return { items, hasMore };
  }
}
