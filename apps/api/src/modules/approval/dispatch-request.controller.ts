import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { CreateDispatchRequestDto } from './dto/create-dispatch-request.dto';
import { DispatchRequestService } from './dispatch-request.service';

@ApiTags('approval')
@Controller('me/dispatch-requests')
export class DispatchRequestController {
  constructor(private readonly service: DispatchRequestService) {}

  @Post()
  create(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: CreateDispatchRequestDto) {
    return this.service.create(principal.employeeId, dto);
  }

  @Get()
  list(@CurrentPrincipal() principal: EmployeePrincipal) {
    return this.service.list(principal.employeeId);
  }
}
