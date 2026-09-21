import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { ScheduleMeService } from './schedule-me.service';

/** 근로자 본인 조회 — org-scope가 아니라 principal.employeeId 자기 자신으로만
 * 필터한다(그 어떤 역할이든 자기 데이터는 볼 수 있다). */
@ApiTags('schedule')
@Controller('schedule/me')
export class ScheduleMeController {
  constructor(private readonly service: ScheduleMeService) {}

  @Get()
  @ApiQuery({ name: 'yearMonth', required: true, description: 'YYYY-MM' })
  monthly(@CurrentPrincipal() principal: EmployeePrincipal, @Query('yearMonth') yearMonth: string) {
    return this.service.monthly(principal.employeeId, yearMonth);
  }

  @Get('yearly')
  @ApiQuery({ name: 'year', required: true, description: 'YYYY' })
  yearly(@CurrentPrincipal() principal: EmployeePrincipal, @Query('year') year: string) {
    return this.service.yearly(principal.employeeId, Number(year));
  }
}
