import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PunchPolicyResolverService } from '../../common/policy/punch-policy-resolver.service';
import { decrypt, encrypt } from '../../common/crypto/symmetric.util';
import { generateTotp, generateTotpSecret } from '../../common/crypto/totp.util';
import { deriveWorkDate } from '../../common/time/work-date.util';

export class QrSecretNotProvisionedError extends NotFoundException {
  constructor() {
    super({ code: 'QR_SECRET_NOT_PROVISIONED', message: '이 사업장에는 아직 QR 시크릿이 발급되지 않았습니다.' });
  }
}

/**
 * 사업장 QR TOTP 시크릿 생성/저장/조회. 관리 UI는 STEP 5-B/6 몫이라
 * provision()은 서비스 메서드로만 존재한다 — 지금은 시드/테스트가 직접
 * 호출한다.
 */
@Injectable()
export class QrSecretProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly policyResolver: PunchPolicyResolverService,
  ) {}

  /** 평문 시크릿을 딱 1번, 호출자에게만 반환한다(예: 관리자 QR 표시용) — DB에는 암호문만 남는다. */
  async provision(siteId: string): Promise<string> {
    const secret = generateTotpSecret();
    const key = this.config.get<string>('crypto.qrTotpEncryptionKey')!;
    await this.prisma.site.update({
      where: { id: siteId },
      data: { qrTotpSecretEncrypted: encrypt(secret, key), qrTotpSecretUpdatedAt: new Date() },
    });
    return secret;
  }

  /**
   * STEP5-B: 키오스크 QR 표시 모드용 — 저장된 시크릿을 복호화해 "지금 이
   * 순간"의 6자리 코드를 계산해 돌려준다. provision()과 나란히 두되 지금까지
   * 검증 경로(qr-nfc-verification.service.ts)에서만 쓰이던 generateTotp()를
   * 처음으로 표시 경로에서도 호출한다.
   */
  async getCurrentCode(siteId: string): Promise<{ code: string; periodSeconds: number; expiresAt: string }> {
    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    if (!site.qrTotpSecretEncrypted) throw new QrSecretNotProvisionedError();

    const key = this.config.get<string>('crypto.qrTotpEncryptionKey')!;
    const secret = decrypt(site.qrTotpSecretEncrypted, key);
    const policy = await this.policyResolver.resolve(siteId, deriveWorkDate(new Date()));

    const now = new Date();
    const code = generateTotp(secret, policy.qrTotpPeriodSeconds, now);
    const periodMs = policy.qrTotpPeriodSeconds * 1000;
    const currentStepStartMs = Math.floor(now.getTime() / periodMs) * periodMs;
    const expiresAt = new Date(currentStepStartMs + periodMs);

    return { code, periodSeconds: policy.qrTotpPeriodSeconds, expiresAt: expiresAt.toISOString() };
  }
}
