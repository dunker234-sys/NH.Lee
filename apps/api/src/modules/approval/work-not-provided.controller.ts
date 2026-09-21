import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { JudgeWorkNotProvidedDto } from './dto/judge-work-not-provided.dto';
import { WorkNotProvidedService } from './work-not-provided.service';

@ApiTags('approval')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/approval/work-not-provided-judgments')
export class WorkNotProvidedController {
  constructor(private readonly service: WorkNotProvidedService) {}

  @Post()
  judge(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: JudgeWorkNotProvidedDto) {
    return this.service.judge(scope, principal, dto);
  }

  @Get()
  @ApiQuery({ name: 'siteId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  list(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.list(scope, { siteId, from, to });
  }
}
