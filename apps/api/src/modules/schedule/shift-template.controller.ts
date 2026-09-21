import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { CreateShiftTemplateDto } from './dto/create-shift-template.dto';
import { UpdateShiftTemplateDto } from './dto/update-shift-template.dto';
import { ShiftTemplateService } from './shift-template.service';

@ApiTags('schedule')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/schedule/shift-templates')
export class ShiftTemplateController {
  constructor(private readonly service: ShiftTemplateService) {}

  @Post()
  @ApiOperation({ summary: '교대 패턴 템플릿 생성 — 사업장별 개수 제한 없음' })
  create(@CurrentOrgScope() scope: OrgScope, @Body() dto: CreateShiftTemplateDto) {
    return this.service.create(scope, dto);
  }

  @Get()
  @ApiQuery({ name: 'siteId', required: true })
  list(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string) {
    return this.service.list(scope, siteId);
  }

  @Patch(':id')
  update(@CurrentOrgScope() scope: OrgScope, @Param('id') id: string, @Body() dto: UpdateShiftTemplateDto) {
    return this.service.update(scope, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '미래 스케줄이 참조 중이면 409(SHIFT_TEMPLATE_IN_USE)' })
  async remove(@CurrentOrgScope() scope: OrgScope, @Param('id') id: string) {
    await this.service.remove(scope, id);
    return { success: true };
  }
}
