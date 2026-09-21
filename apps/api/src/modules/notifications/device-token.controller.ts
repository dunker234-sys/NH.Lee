import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { DeviceTokenService } from './device-token.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@ApiTags('device-tokens')
@Controller('device-tokens')
export class DeviceTokenController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  @Post()
  @ApiOperation({ summary: '기기 푸시 토큰 등록/갱신 — 같은 (기기, 플랫폼) 재등록은 upsert된다' })
  async register(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: RegisterDeviceTokenDto) {
    const deviceToken = await this.deviceTokenService.register({
      employeeId: principal.employeeId,
      deviceId: dto.deviceId,
      platform: dto.platform,
      token: dto.token,
    });
    return {
      id: deviceToken.id,
      deviceId: deviceToken.deviceId,
      platform: deviceToken.platform,
      isValid: deviceToken.isValid,
      lastRefreshedAt: deviceToken.lastRefreshedAt,
    };
  }
}
