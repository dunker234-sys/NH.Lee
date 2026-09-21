import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { LeaveBalanceMeService } from './leave-balance-me.service';

/** 근로자 본인 조회 — org-scope 없이 principal.employeeId로만 필터한다
 * (schedule-me.controller.ts와 동일 패턴). */
@ApiTags('leave')
@Controller('me/leave-balances')
export class LeaveBalanceMeController {
  constructor(private readonly service: LeaveBalanceMeService) {}

  @Get()
  @ApiQuery({ name: 'year', required: false, description: 'YYYY — referencePeriod 접두 필터' })
  list(@CurrentPrincipal() principal: EmployeePrincipal, @Query('year') year?: string) {
    return this.service.list(principal.employeeId, year);
  }
}
