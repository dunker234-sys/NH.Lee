import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../common/decorators/current-principal.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../../common/principal/principal.types';
import { PayrollColumnMappingService } from './payroll-column-mapping.service';
import { CreateColumnMappingDto } from './dto/create-column-mapping.dto';

@ApiTags('payroll-close')
@Roles('HQ_HR', 'ADMIN')
@Controller('admin/payroll-close/column-mappings')
export class PayrollColumnMappingController {
  constructor(private readonly service: PayrollColumnMappingService) {}

  @Get()
  list(@Query('siteId') siteId?: string) {
    return this.service.list(siteId);
  }

  @Post()
  create(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: CreateColumnMappingDto) {
    return this.service.create({ ...dto, createdBy: principal.employeeId });
  }
}
