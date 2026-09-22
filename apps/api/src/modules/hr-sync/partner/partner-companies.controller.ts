import { BadRequestException, Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../common/decorators/current-principal.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../../common/principal/principal.types';
import { PartnerCompaniesService } from './partner-companies.service';
import { PartnerEmployeeExcelService } from './partner-employee-excel.service';

/**
 * 파견·협력업체 관리(요구사항서 5장④). 협력사 자체는 사업장 스코프 개념이
 * 아니라 org-scope 이중 필터를 적용하지 않는다 — HQ_HR/ADMIN 역할 게이트만.
 */
@ApiTags('hr-sync')
@Roles('HQ_HR', 'ADMIN')
@Controller('admin/partner-companies')
export class PartnerCompaniesController {
  constructor(
    private readonly service: PartnerCompaniesService,
    private readonly excelService: PartnerEmployeeExcelService,
  ) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() body: { code: string; name: string; contactName?: string; contactEmail?: string }) {
    return this.service.create(body);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Post(':id/employees')
  @ApiOperation({ summary: '협력사 소속 직원 수동 등록 1건' })
  registerEmployee(
    @Param('id') id: string,
    @CurrentPrincipal() principal: EmployeePrincipal,
    @Body()
    body: { employeeNo: string; name: string; primarySiteId: string; hireDate: string; jobTitle?: string; department?: string },
  ) {
    return this.service.registerEmployee(id, principal, body);
  }

  @Post(':id/employees/excel')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '협력사 소속 직원 엑셀 일괄 등록' })
  async registerEmployeesExcel(
    @Param('id') id: string,
    @CurrentPrincipal() principal: EmployeePrincipal,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException({ code: 'PARTNER_EXCEL_FILE_REQUIRED', message: '파일이 필요합니다.' });
    return this.excelService.importForCompany(id, principal, file.buffer);
  }

  @Post(':id/admins')
  @ApiOperation({ summary: '협력업체 관리자 계정 발급(수정사항) — 임시 비밀번호는 이 응답에서만 노출된다' })
  registerAdmin(
    @Param('id') id: string,
    @CurrentPrincipal() principal: EmployeePrincipal,
    @Body() body: { employeeNo: string; name: string; primarySiteId: string },
  ) {
    return this.service.registerAdmin(id, principal, body);
  }

  @Post(':id/employees/:employeeId/resign')
  @ApiOperation({ summary: '파견직 퇴사자 등록(수정사항)' })
  resignEmployee(
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
    @CurrentPrincipal() principal: EmployeePrincipal,
    @Body() body: { resignationDate: string },
  ) {
    return this.service.resignEmployee(id, employeeId, principal, body);
  }

  @Get(':id/labor-cost')
  @ApiOperation({ summary: '파견직 인건비 확인(수정사항) — 등록된 임금요율 기준(실지급액 아님)' })
  laborCost(@Param('id') id: string, @Query('asOfDate') asOfDate: string) {
    return this.service.laborCost(id, asOfDate);
  }
}
