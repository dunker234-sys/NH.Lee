import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { AnnualLeaveAccrualService } from './annual-leave-accrual.service';
import { MigrateFiscalYearBasisDto } from './dto/migrate-fiscal-year-basis.dto';
import { RunAccrualBatchDto } from './dto/run-accrual-batch.dto';

@ApiTags('leave')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/leave/accrual')
export class LeaveAccrualAdminController {
  constructor(private readonly service: AnnualLeaveAccrualService) {}

  @Post('run')
  @ApiOperation({ summary: '수동/테스트 트리거 — 자동 스케줄링은 파일럿 검증 후 별도 후속 작업' })
  run(@CurrentOrgScope() scope: OrgScope, @Body() dto: RunAccrualBatchDto) {
    return this.service.run(scope, dto.asOfDate, dto.siteId);
  }

  /** 회계연도 기준 소급 재계산(수정사항) — 기존 값을 덮어쓰는 파급력 큰 작업이라
   * 프로그램 관리자(ADMIN) 전용으로 좁힌다. */
  @Roles('ADMIN')
  @Post('migrate-to-fiscal-year')
  @ApiOperation({ summary: '연차 회계연도 전환 소급 재계산 — 기존 LeaveBalance를 회계연도 기준 값으로 덮어쓴다' })
  migrateToFiscalYearBasis(
    @CurrentOrgScope() scope: OrgScope,
    @CurrentPrincipal() principal: EmployeePrincipal,
    @Body() dto: MigrateFiscalYearBasisDto,
  ) {
    return this.service.migrateToFiscalYearBasis(scope, dto.siteId, dto.asOfDate, principal.employeeId, principal.role);
  }
}
