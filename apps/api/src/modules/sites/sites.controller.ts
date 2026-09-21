import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { SitesService } from './sites.service';

@ApiTags('sites')
@Controller('sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  @ApiOperation({ summary: '호출자의 활성 사업장 배정 목록(타각 사업장 선택용)' })
  async listMine(@CurrentPrincipal() principal: EmployeePrincipal) {
    return { items: await this.sitesService.listActiveForEmployee(principal.employeeId) };
  }

  @Get(':id')
  @ApiOperation({ summary: '사업장 상세(타각·파견 등에서 siteId를 이름으로 해석할 때 사용)' })
  async getById(@Param('id') id: string) {
    return this.sitesService.getById(id);
  }
}
