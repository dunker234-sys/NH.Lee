import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { EmployeeWageRateService } from './employee-wage-rate.service';
import { SetWageRateDto } from './dto/set-wage-rate.dto';

/** 급여 정보라 쓰기·조회는 HQ_HR/ADMIN만 — employee_protected_status와 동일한 권한 모델. */
@ApiTags('payroll-close')
@Roles('HQ_HR', 'ADMIN')
@Controller('admin/employees/:employeeId/wage-rate')
export class EmployeeWageRateController {
  constructor(private readonly service: EmployeeWageRateService) {}

  @Get()
  history(@Param('employeeId') employeeId: string) {
    return this.service.history(employeeId);
  }

  @Post()
  set(@CurrentPrincipal() principal: EmployeePrincipal, @Param('employeeId') employeeId: string, @Body() dto: SetWageRateDto) {
    return this.service.setRate({ employeeId, ...dto, createdBy: principal.employeeId });
  }
}
