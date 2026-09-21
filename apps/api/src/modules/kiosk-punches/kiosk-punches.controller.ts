import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { KioskDevice } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { sha256 } from '../../common/crypto/hash.util';
import { KioskDevicesRepository } from '../kiosk-devices/kiosk-devices.repository';
import { KioskPunchBulkDto, KioskPunchDto } from './dto/kiosk-punch.dto';
import { PairKioskDeviceDto } from './dto/pair-kiosk-device.dto';
import { KioskDeviceGuard, KioskDeviceInvalidError } from './guards/kiosk-device.guard';
import { KioskPunchesService } from './kiosk-punches.service';

interface KioskDeviceRequest {
  kioskDevice: KioskDevice;
}

/**
 * 키오스크 전용 컨트롤러 — 전역 JwtAuthGuard/PrincipalGuard/RolesGuard를
 * @Public()으로 완전히 우회하고 KioskDeviceGuard(기기 자격증명)만으로
 * 인증한다. 15분 JWT+1직원 고정이라는 기존 세션 모델이 "공용 기기, 하루
 * 수십 명, 5초 회전"에 맞지 않아 의도적으로 별도 파이프라인이다.
 */
@Public()
@ApiTags('kiosk-punches')
@Controller('kiosk')
export class KioskPunchesController {
  constructor(
    private readonly service: KioskPunchesService,
    private readonly kioskDevicesRepo: KioskDevicesRepository,
  ) {}

  @Post('pair')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '최초 설정 — 관리자가 발급한 페어링 토큰이 유효한지 확인하고 사업장 정보를 돌려준다' })
  async pair(@Body() dto: PairKioskDeviceDto) {
    const device = await this.kioskDevicesRepo.findByCredentialHashWithSite(sha256(dto.credential));
    if (!device || device.status !== 'ACTIVE') throw new KioskDeviceInvalidError();
    return { kioskDeviceId: device.id, siteId: device.siteId, siteName: device.site.name };
  }

  @UseGuards(KioskDeviceGuard)
  @Post('punches')
  @ApiOperation({ summary: '사번+PIN 타각(온라인, 1건) — 응답은 마스킹된 이름만 담는다' })
  async punch(@Req() req: KioskDeviceRequest, @Body() dto: KioskPunchDto) {
    return this.service.punchOne(req.kioskDevice, dto);
  }

  @UseGuards(KioskDeviceGuard)
  @Post('punches/bulk')
  @ApiOperation({ summary: '오프라인 복구 재전송 — 항목별로 PIN을 재검증한다(오프라인 중 서버 검증이 불가능했으므로)' })
  async punchBulk(@Req() req: KioskDeviceRequest, @Body() dto: KioskPunchBulkDto) {
    return this.service.punchBulk(req.kioskDevice, dto);
  }

  @UseGuards(KioskDeviceGuard)
  @Get('qr-code')
  @ApiOperation({ summary: 'QR 표시 모드 — 현재 순간의 6자리 TOTP 코드와 갱신 주기를 반환한다' })
  async qrCode(@Req() req: KioskDeviceRequest) {
    return this.service.getCurrentQrCode(req.kioskDevice.siteId);
  }
}
