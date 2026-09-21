import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistrationMethod, Site } from '@prisma/client';
import { decrypt } from '../../common/crypto/symmetric.util';
import { verifyTotp } from '../../common/crypto/totp.util';
import { SiteVerificationSignalRepository } from '../../common/punch/site-verification-signal.repository';
import { PunchPolicy } from '../../common/policy/punch-policy-resolver.service';

export interface VerificationEvaluation {
  integrityFlags: string[];
  isLow: boolean;
}

const OK: VerificationEvaluation = { integrityFlags: [], isLow: false };

/**
 * NFC/QR 검증. NFC가 기본 수단(사업장 고정 태그 UID 매핑), QR은 예비 수단으로
 * TOTP + policy_config.qr_verification_policy에 따라 검증한다. 어떤 결과든
 * 거부하지 않는다 — flags/LOW로만 표현한다.
 */
@Injectable()
export class QrNfcVerificationService {
  constructor(
    private readonly signalRepo: SiteVerificationSignalRepository,
    private readonly config: ConfigService,
  ) {}

  async evaluate(
    site: Site,
    registrationMethod: RegistrationMethod,
    token: string | undefined,
    deviceTrusted: boolean,
    wifiBssid: string | undefined,
    cellId: string | undefined,
    policy: PunchPolicy,
  ): Promise<VerificationEvaluation> {
    if (registrationMethod === 'NFC') return this.evaluateNfc(site.id, token);
    if (registrationMethod === 'QR') return this.evaluateQr(site, token, deviceTrusted, wifiBssid, cellId, policy);
    // GPS/PC/TABLET: NFC/QR 검증 대상이 아니다.
    return OK;
  }

  private async evaluateNfc(siteId: string, tagUid: string | undefined): Promise<VerificationEvaluation> {
    if (!tagUid) return { integrityFlags: ['NFC_TAG_MISMATCH'], isLow: true };
    const signal = await this.signalRepo.findActive(siteId, 'NFC_TAG', tagUid);
    return signal ? OK : { integrityFlags: ['NFC_TAG_MISMATCH'], isLow: true };
  }

  private async evaluateQr(
    site: Site,
    token: string | undefined,
    deviceTrusted: boolean,
    wifiBssid: string | undefined,
    cellId: string | undefined,
    policy: PunchPolicy,
  ): Promise<VerificationEvaluation> {
    if (policy.qrVerificationPolicy === 'NFC_ONLY') {
      return { integrityFlags: ['QR_DISABLED_BY_POLICY'], isLow: true };
    }

    // QR_WITH_AUX_CHECK: TOTP 일치 AND 기기 신뢰 AND 보조신호(Wi-Fi BSSID/Cell ID) 일치.
    if (!site.qrTotpSecretEncrypted || !token) {
      return { integrityFlags: ['QR_VERIFICATION_INCONCLUSIVE'], isLow: true };
    }
    const key = this.config.get<string>('crypto.qrTotpEncryptionKey')!;
    const secret = decrypt(site.qrTotpSecretEncrypted, key);
    const totpOk = verifyTotp(secret, policy.qrTotpPeriodSeconds, token);
    const auxOk = await this.checkAuxSignal(site.id, wifiBssid, cellId);

    return totpOk && deviceTrusted && auxOk ? OK : { integrityFlags: ['QR_VERIFICATION_INCONCLUSIVE'], isLow: true };
  }

  private async checkAuxSignal(siteId: string, wifiBssid: string | undefined, cellId: string | undefined): Promise<boolean> {
    if (wifiBssid && (await this.signalRepo.findActive(siteId, 'WIFI_BSSID', wifiBssid))) return true;
    if (cellId && (await this.signalRepo.findActive(siteId, 'CELL_ID', cellId))) return true;
    return false;
  }
}
