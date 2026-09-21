import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveRequestService } from './leave-request.service';

@ApiTags('leave')
@Controller('me/leave-requests')
export class LeaveRequestMeController {
  constructor(private readonly service: LeaveRequestService) {}

  @Post()
  create(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: CreateLeaveRequestDto) {
    return this.service.create(principal.employeeId, dto);
  }

  @Get()
  list(@CurrentPrincipal() principal: EmployeePrincipal) {
    return this.service.list(principal.employeeId);
  }

  @Post(':id/cancel')
  cancel(@CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string) {
    return this.service.cancel(principal.employeeId, id);
  }
}
