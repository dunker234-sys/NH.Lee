import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CorrectionStatus } from '@prisma/client';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { CorrectionRequestService } from './correction-request.service';
import { SubmitCorrectionDto } from './dto/submit-correction.dto';

@ApiTags('correction')
@Controller('me/correction-requests')
export class CorrectionRequestController {
  constructor(private readonly service: CorrectionRequestService) {}

  @Post()
  submit(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: SubmitCorrectionDto) {
    return this.service.submit(principal, dto);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false })
  list(@CurrentPrincipal() principal: EmployeePrincipal, @Query('status') status?: CorrectionStatus) {
    return this.service.listMine(principal.employeeId, status);
  }
}
