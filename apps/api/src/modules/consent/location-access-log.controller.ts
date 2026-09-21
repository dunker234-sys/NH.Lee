import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CursorPageQueryDto } from '../../common/dto/cursor-page-query.dto';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { LocationAccessLogRepository } from '../../common/access-log/location-access-log.repository';

const DEFAULT_LIMIT = 50;

@ApiTags('location-access-log')
@Controller('location-access-log')
export class LocationAccessLogController {
  constructor(private readonly repo: LocationAccessLogRepository) {}

  @Get()
  @ApiOperation({ summary: '본인 위치정보 확인자료 열람(위치정보법 §16조②/§24조③, self-scoped)' })
  async list(@CurrentPrincipal() principal: EmployeePrincipal, @Query() query: CursorPageQueryDto) {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const rows = await this.repo.findByEmployee(principal.employeeId, query.before ? new Date(query.before) : undefined, limit + 1);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
      id: r.id,
      punchLocationId: r.punchLocationId,
      accessedBy: r.accessedBy,
      accessPurpose: r.accessPurpose,
      accessedAt: r.accessedAt,
    }));
    return { items, hasMore };
  }
}
