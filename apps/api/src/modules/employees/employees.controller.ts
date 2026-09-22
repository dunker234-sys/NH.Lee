import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { SetEmployeePinDto } from './dto/set-employee-pin.dto';
import { SetEmployeeProtectedStatusDto } from './dto/set-employee-protected-status.dto';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
  @Get()
  @ApiOperation({
    summary: '조직 스코프 가드 증명용 최소 엔드포인트',
    description: 'siteId를 지정하면 스코프 밖일 때 403(ORG_SCOPE_DENIED). 지정하지 않으면 스코프 내로 자동 필터된다.',
  })
  @ApiQuery({ name: 'siteId', required: false })
  list(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId?: string) {
    return this.employeesService.list(scope, siteId);
  }

  @Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
  @Post(':id/pin')
  @ApiOperation({ summary: 'STEP5-B: 키오스크 PIN 관리자 발급/재설정 — 개인폰이 없는 인력을 위한 관리자 발급 절차' })
  setPin(@CurrentOrgScope() scope: OrgScope, @Param('id') employeeId: string, @Body() dto: SetEmployeePinDto) {
    return this.employeesService.setPin(scope, employeeId, dto.pin);
  }

  @Roles('ADMIN')
  @Post(':id/protected-status')
  @ApiOperation({
    summary: 'STEP6: 임신 등 보호 상태 신고(2026-09 수정사항 — "프로그램 관리자" ADMIN 전용)',
    description:
      '민감정보라 다른 관리자 역할(SITE_MANAGER/REGIONAL/HQ_HR)은 호출할 수 없다. ' +
      'Employee 본체와 분리된 EmployeeProtectedStatus에 유효기간 있는 레코드로 저장된다.',
  })
  setProtectedStatus(
    @CurrentOrgScope() scope: OrgScope,
    @CurrentPrincipal() principal: EmployeePrincipal,
    @Param('id') employeeId: string,
    @Body() dto: SetEmployeeProtectedStatusDto,
  ) {
    return this.employeesService.setProtectedStatus(scope, principal, employeeId, dto);
  }
}
