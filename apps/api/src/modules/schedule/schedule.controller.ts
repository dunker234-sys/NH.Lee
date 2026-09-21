import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { AssignSubstituteDto } from './dto/assign-substitute.dto';
import { BulkPatchSchedulesDto } from './dto/bulk-patch-schedules.dto';
import { ConfirmSchedulesDto } from './dto/confirm-schedules.dto';
import { PatchScheduleCellDto } from './dto/patch-schedule-cell.dto';
import { ScheduleService } from './schedule.service';

@ApiTags('schedule')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/schedule/schedules')
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: true })
  @ApiQuery({ name: 'yearMonth', required: true, description: 'YYYY-MM' })
  getGrid(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string, @Query('yearMonth') yearMonth: string) {
    return this.service.getGrid(scope, siteId, yearMonth);
  }

  // 'bulk'는 :id보다 먼저 등록해야 한다 — 그렇지 않으면 PATCH .../bulk가
  // :id="bulk"로 patchOne에 먼저 매칭돼 버린다(Express/Nest는 등록 순서로
  // 라우트를 매칭한다). 실제로 이 순서 버그를 e2e 테스트가 잡아냈다.
  @Patch('bulk')
  @ApiOperation({ summary: '변경된 셀만 일괄 전송 — 하나라도 충돌하면 전체 롤백(409 SCHEDULE_BULK_VERSION_CONFLICT)' })
  patchBulk(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: BulkPatchSchedulesDto) {
    return this.service.patchBulk(scope, principal, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '셀 하나 편집 — expectedVersion 불일치 시 409(SCHEDULE_VERSION_CONFLICT)' })
  patchOne(@CurrentOrgScope() scope: OrgScope, @Param('id') id: string, @Body() dto: PatchScheduleCellDto) {
    return this.service.patchOne(scope, id, dto);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'DRAFT→CONFIRMED. hard-block 위반 시 400, 미해결 soft-warning 있으면 override 없이는 400' })
  confirm(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: ConfirmSchedulesDto) {
    return this.service.confirm(scope, principal, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string) {
    return this.service.cancel(scope, principal, id);
  }

  @Post(':id/substitute')
  @ApiOperation({ summary: '결원·대체 투입 — 원 배정 행은 유지하고 대체자용 새 행을 만든다' })
  assignSubstitute(
    @CurrentOrgScope() scope: OrgScope,
    @CurrentPrincipal() principal: EmployeePrincipal,
    @Param('id') id: string,
    @Body() dto: AssignSubstituteDto,
  ) {
    return this.service.assignSubstitute(scope, principal, id, dto);
  }
}
