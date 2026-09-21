import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { CompensatoryLeaveService } from './compensatory-leave.service';
import { ConvertCompensatoryLeaveDto } from './dto/convert-compensatory-leave.dto';

@ApiTags('leave')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/leave/compensatory')
export class CompensatoryLeaveAdminController {
  constructor(private readonly service: CompensatoryLeaveService) {}

  @Post('convert')
  convert(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: ConvertCompensatoryLeaveDto) {
    return this.service.convert(principal, dto);
  }
}
