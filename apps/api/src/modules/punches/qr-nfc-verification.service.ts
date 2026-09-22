import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistrationMethod, Site } from '@prisma/client';
import { decrypt } from '../../common/crypto/symmetric.util';
import { verifyDailyCode, verifyTotp } from '../../common/crypto/totp.util';
import { SiteVerificationSignalRepository } from '../../common/punch/site-verification-signal.repository';
import { PunchPolicy } from '../../common/policy/punch-policy-resolver.service';

export interface VerificationEvaluation {
  integrityFlags: string[];
  isLow: boolean;
}

const OK: VerificationEvaluation = { integrityFlags: [], isLow: false };

/**
 * NFC/QR 검증. NFC가 기본 수단(사업장 고정 태그 UID 매핑), QR은 예비 수단으로
 * policy_config.qr_verification_policy에 따라 검증한다. QR은 두 종류를 함께
 * 시도한다 — 키오스크 실시간 화면(60초 TOTP, Wi-Fi/Cell 대역신호 요구)과 인쇄용
 * 일단위 코드(근로일 단위 정적 코드, 지오펜스 통과 요구 — 수정사항). 어떤 결과든
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
    workDate: string,
    geofenceOk: boolean,
  ): Promise<VerificationEvaluation> {
    if (registrationMethod === 'NFC') return this.evaluateNfc(site.id, token);
    if (registrationMethod === 'QR') return this.evaluateQr(site, token, deviceTrusted, wifiBssid, cellId, policy, workDate, geofenceOk);
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
    workDate: string,
    geofenceOk: boolean,
  ): Promise<VerificationEvaluation> {
    if (policy.qrVerificationPolicy === 'NFC_ONLY') {
      return { integrityFlags: ['QR_DISABLED_BY_POLICY'], isLow: true };
    }

    if (!site.qrTotpSecretEncrypted || !token) {
      return { integrityFlags: ['QR_VERIFICATION_INCONCLUSIVE'], isLow: true };
    }
    const key = this.config.get<string>('crypto.qrTotpEncryptionKey')!;
    const secret = decrypt(site.qrTotpSecretEncrypted, key);

    // 키오스크 실시간 화면(60초 회전 TOTP): 기기 신뢰 + Wi-Fi/Cell 대역신호까지 요구한다.
    const totpOk = verifyTotp(secret, policy.qrTotpPeriodSeconds, token);
    if (totpOk) {
      const auxOk = await this.checkAuxSignal(site.id, wifiBssid, cellId);
      return deviceTrusted && auxOk ? OK : { integrityFlags: ['QR_VERIFICATION_INCONCLUSIVE'], isLow: true };
    }

    // 인쇄용 일단위 코드(수정사항): 대역신호 대신 지오펜스 통과 여부로 대체한다 —
    // 포스터를 스캔하는 근로자 개인 휴대폰은 사업장 고정 Wi-Fi/Cell 신호가 없다.
    const dailyOk = verifyDailyCode(secret, token, workDate);
    if (dailyOk) {
      return deviceTrusted && geofenceOk ? OK : { integrityFlags: ['QR_VERIFICATION_INCONCLUSIVE'], isLow: true };
    }

    return { integrityFlags: ['QR_VERIFICATION_INCONCLUSIVE'], isLow: true };
  }

  private async checkAuxSignal(siteId: string, wifiBssid: string | undefined, cellId: string | undefined): Promise<boolean> {
    if (wifiBssid && (await this.signalRepo.findActive(siteId, 'WIFI_BSSID', wifiBssid))) return true;
    if (cellId && (await this.signalRepo.findActive(siteId, 'CELL_ID', cellId))) return true;
    return false;
  }
}
