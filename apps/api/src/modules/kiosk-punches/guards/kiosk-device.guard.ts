import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { KioskDevice } from '@prisma/client';
import { sha256 } from '../../../common/crypto/hash.util';
import { KioskDevicesRepository } from '../../kiosk-devices/kiosk-devices.repository';

const CREDENTIAL_HEADER = 'x-kiosk-device-credential';

export class KioskDeviceInvalidError extends UnauthorizedException {
  constructor() {
    super({ code: 'KIOSK_DEVICE_INVALID', message: '유효하지 않은 키오스크 기기 자격증명입니다.' });
  }
}

/**
 * 키오스크 전용 인증 — 일반 직원 JWT 파이프라인(JwtAuthGuard/PrincipalGuard)을
 * 완전히 우회한다(컨트롤러가 @Public()). Authorization 헤더 대신 별도
 * X-Kiosk-Device-Credential 헤더를 쓴다 — "기기 레벨 자격증명"임을 명확히
 * 구분하고, 라우팅 실수로 passport-jwt 전략이 이 값을 JWT로 파싱 시도하는
 * 사고를 막는다. request.kioskDevice를 부착한다(PrincipalGuard의
 * request.principal과 같은 자리).
 */
@Injectable()
export class KioskDeviceGuard implements CanActivate {
  constructor(private readonly repo: KioskDevicesRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawCredential = request.headers[CREDENTIAL_HEADER];
    if (!rawCredential || typeof rawCredential !== 'string') throw new KioskDeviceInvalidError();

    const device: KioskDevice | null = await this.repo.findByCredentialHash(sha256(rawCredential));
    if (!device || device.status !== 'ACTIVE') throw new KioskDeviceInvalidError();

    request.kioskDevice = device;
    // 5초 예산에 DB 왕복을 추가하지 않도록 응답을 기다리지 않는다 — 실패해도 인증 자체와 무관하다.
    this.repo.touchLastSeen(device.id).catch(() => {});
    return true;
  }
}
