import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { ConsentService } from './consent.service';
import { ConsentTypeQueryDto } from './dto/consent-type-query.dto';
import { RecordConsentDto } from './dto/record-consent.dto';

@ApiTags('consent')
@Controller('consent')
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get('policy')
  @ApiOperation({ summary: '동의 화면이 표시할 법정 고지 항목(보유기간·정책버전) — policy_config가 유일한 출처' })
  async getPolicy(@Query() query: ConsentTypeQueryDto) {
    return this.consentService.getPolicy(query.type);
  }

  @Get()
  @ApiOperation({ summary: '본인 동의 현재상태 + 전체 이력(self-scoped)' })
  async getStatus(@CurrentPrincipal() principal: EmployeePrincipal, @Query() query: ConsentTypeQueryDto) {
    return this.consentService.getStatus(principal.employeeId, query.type);
  }

  @Post()
  @ApiOperation({ summary: '최초 동의 또는 일시중지 후 재개 기록' })
  async agree(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: RecordConsentDto) {
    return this.consentService.agree(principal.employeeId, dto.consentType);
  }

  @Post('location/pause')
  @ApiOperation({ summary: '위치정보 수집 일시중지(위치정보법 §24②) — 일시중지 행위 자체를 서버 이력으로 기록' })
  async pauseLocation(@CurrentPrincipal() principal: EmployeePrincipal) {
    return this.consentService.pause(principal.employeeId, 'LOCATION_COLLECTION');
  }

  @Post('location/withdraw')
  @ApiOperation({ summary: '위치정보 수집 동의 철회(위치정보법 §24④)' })
  async withdrawLocation(@CurrentPrincipal() principal: EmployeePrincipal) {
    return this.consentService.withdraw(principal.employeeId, 'LOCATION_COLLECTION');
  }
}
