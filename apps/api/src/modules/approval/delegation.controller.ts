import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { CreateDelegationDto } from './dto/create-delegation.dto';
import { DelegationService } from './delegation.service';

@ApiTags('approval')
@Controller('me/delegations')
export class DelegationController {
  constructor(private readonly service: DelegationService) {}

  @Post()
  create(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: CreateDelegationDto) {
    return this.service.create(principal.employeeId, dto);
  }

  @Get()
  list(@CurrentPrincipal() principal: EmployeePrincipal) {
    return this.service.list(principal.employeeId);
  }

  @Post(':id/revoke')
  revoke(@CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string) {
    return this.service.revoke(principal.employeeId, id);
  }
}
