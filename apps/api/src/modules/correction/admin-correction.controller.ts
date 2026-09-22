import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { AdminCorrectionService } from './admin-correction.service';
import { AdminCorrectionDto } from './dto/admin-correction.dto';

/** 직권 정정(요구사항 4.7-4) — 2026-09 수정사항으로 "프로그램 관리자"(ADMIN) 전용. */
@ApiTags('correction')
@Roles('ADMIN')
@Controller('admin/correction/admin-direct')
export class AdminCorrectionController {
  constructor(private readonly service: AdminCorrectionService) {}

  @Post()
  create(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: AdminCorrectionDto) {
    return this.service.create(scope, principal, dto);
  }
}
