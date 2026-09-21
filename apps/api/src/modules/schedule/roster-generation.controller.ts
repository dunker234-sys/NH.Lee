import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { GenerateRosterDto } from './dto/generate-roster.dto';
import { RosterGenerationService } from './roster-generation.service';

@ApiTags('schedule')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/schedule/rosters')
export class RosterGenerationController {
  constructor(private readonly service: RosterGenerationService) {}

  @Post('generate')
  @ApiOperation({ summary: '반복 규칙으로 편성 일괄 생성(벌크 인서트, 30명×30일 3초 이내)' })
  generate(@CurrentOrgScope() scope: OrgScope, @Body() dto: GenerateRosterDto) {
    return this.service.generate(scope, dto);
  }
}
