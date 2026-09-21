import { Controller, Param, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { ProvisionKioskDeviceDto } from './dto/provision-kiosk-device.dto';
import { KioskDevicesService } from './kiosk-devices.service';

/**
 * 관리자용 키오스크 기기 프로비저닝. 일반 전역 가드 체인(JwtAuthGuard/
 * PrincipalGuard/RolesGuard)을 그대로 쓴다 — 관리자가 로그인한 상태에서
 * 호출하는 정상 인증 엔드포인트다. employees.controller.ts와 같은 역할셋.
 */
@ApiTags('kiosk-devices')
@Controller('admin/kiosk-devices')
export class KioskDevicesController {
  constructor(private readonly service: KioskDevicesService) {}

  @Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
  @Post()
  @ApiOperation({ summary: '키오스크 기기 페어링 발급 — 원본 토큰은 이 응답에서 한 번만 노출된다' })
  provision(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: ProvisionKioskDeviceDto) {
    return this.service.provision(principal, dto.siteId, dto.label);
  }

  @Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
  @Post(':id/revoke')
  @ApiOperation({ summary: '키오스크 기기 폐기 — 다음 요청부터 즉시 무효화된다' })
  revoke(@CurrentPrincipal() principal: EmployeePrincipal, @Param('id') id: string) {
    return this.service.revoke(principal, id);
  }
}
