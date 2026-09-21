import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { OvertimeRequestStatus } from '@prisma/client';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { OvertimeRequestService } from './overtime-request.service';

@ApiTags('approval')
@Controller('me/overtime-requests')
export class OvertimeRequestController {
  constructor(private readonly service: OvertimeRequestService) {}

  @Post()
  create(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: CreateOvertimeRequestDto) {
    return this.service.create(principal.employeeId, dto);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false })
  list(@CurrentPrincipal() principal: EmployeePrincipal, @Query('status') status?: OvertimeRequestStatus) {
    return this.service.list(principal.employeeId, status);
  }
}
