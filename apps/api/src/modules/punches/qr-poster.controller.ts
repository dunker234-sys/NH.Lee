import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { ProvisionQrPosterDto } from './dto/provision-qr-poster.dto';
import { QrSecretProvisioningService } from './qr-secret-provisioning.service';

/**
 * 관리자용 인쇄용 일단위 QR 발급/조회(수정사항: PC 타각 일단위 QR 출력).
 * 키오스크의 `GET /kiosk/qr-code`는 KioskDeviceGuard(기기 자격증명) 전용이라
 * admin-web 세션에서 부를 수 없다 — 이 컨트롤러가 그 대신 일반 관리자 인증
 * (JwtAuthGuard/PrincipalGuard/RolesGuard) 경로로 같은 시크릿을 노출한다.
 * kiosk-devices.controller.ts와 동일한 RBAC 패턴.
 */
@ApiTags('punches')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/punch/qr-poster')
export class QrPosterController {
  constructor(private readonly qrSecretProvisioning: QrSecretProvisioningService) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: true })
  @ApiOperation({ summary: '오늘자 인쇄용 QR 코드 조회 — 아직 발급 전이면 404(QR_SECRET_NOT_PROVISIONED)' })
  async get(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.qrSecretProvisioning.getDailyCode(siteId);
  }

  @Post('provision')
  @ApiOperation({ summary: 'QR 시크릿 최초 발급 후 오늘자 코드를 바로 반환한다' })
  async provision(@CurrentOrgScope() scope: OrgScope, @Body() dto: ProvisionQrPosterDto) {
    assertScope(scope);
    assertSiteInScope(scope, dto.siteId);
    await this.qrSecretProvisioning.provision(dto.siteId);
    return this.qrSecretProvisioning.getDailyCode(dto.siteId);
  }
}
