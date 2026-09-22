import { Injectable } from '@nestjs/common';
import { PunchRaw, Site, VerificationLevel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { sha256 } from '../../common/crypto/hash.util';
import { deriveWorkDate, deriveWorkDateString } from '../../common/time/work-date.util';
import { PunchLocationRepository } from '../../common/punch/punch-location.repository';
import { PunchRawRepository } from '../../common/punch/punch-raw.repository';
import { DeviceBindingService } from '../auth/device-binding.service';
import { KioskDevicesRepository } from '../kiosk-devices/kiosk-devices.repository';
import { RecalculationTriggerService } from '../recalculation/recalculation-trigger.service';
import { FraudDetectionTriggerService } from '../fraud-detection/fraud-detection-trigger.service';
import { CreatePunchBulkDto } from './dto/create-punch-bulk.dto';
import { CreatePunchDto } from './dto/create-punch.dto';
import { PunchSiteNotFoundError } from './errors/punch-errors';
import { GeofenceService } from './geofence.service';
import { PunchPolicyResolverService } from '../../common/policy/punch-policy-resolver.service';
import { QrNfcVerificationService } from './qr-nfc-verification.service';

export interface PunchCreateResult {
  punch: PunchRaw;
  duplicate: boolean;
}

export type BulkItemStatus = 'CREATED' | 'DUPLICATE' | 'FAILED';

export interface BulkItemResult {
  index: number;
  status: BulkItemStatus;
  punchId?: string;
  verificationLevel?: VerificationLevel;
  error?: string;
}

function truncateToMinuteIso(d: Date): string {
  const copy = new Date(d);
  copy.setSeconds(0, 0);
  return copy.toISOString();
}

/**
 * 요구사항서 4.1의 검증 순서를 그대로 따른다: 인증(컨트롤러의 전역 가드) →
 * 기기 바인딩 확인 → 위치/QR/NFC 검증 → 멱등 저장 → work_date 산출 →
 * 재계산 큐 적재. 어떤 검증 실패도 저장 자체를 막지 않는다 — 항상
 * verification_level/integrity_flags로만 표현한다.
 */
@Injectable()
export class PunchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly punchRawRepo: PunchRawRepository,
    private readonly punchLocationRepo: PunchLocationRepository,
    private readonly deviceBindingService: DeviceBindingService,
    private readonly kioskDevicesRepo: KioskDevicesRepository,
    private readonly geofenceService: GeofenceService,
    private readonly qrNfcService: QrNfcVerificationService,
    private readonly policyResolver: PunchPolicyResolverService,
    private readonly recalcTrigger: RecalculationTriggerService,
    private readonly fraudTrigger: FraudDetectionTriggerService,
  ) {}

  async create(employeeId: string, employeeNo: string, dto: CreatePunchDto): Promise<PunchCreateResult> {
    const site = await this.getSite(dto.siteId);
    const trusted = await this.resolveDeviceTrust(employeeId, dto.registrationMethod, dto.deviceId);
    return this.processOne(employeeId, employeeNo, site, dto, trusted, false);
  }

  /**
   * STEP5-B: TABLET/PC는 DeviceBindingService(직원별 1기기 신뢰 모델)를
   * 쓰지 않는다 — 공용 키오스크·PC의 deviceId는 하루 수십 명이 공유하는데,
   * 그 모델대로면 이미 개인폰이 신뢰기기로 등록된 직원은 키오스크에서
   * 평생 DEVICE_NOT_TRUSTED+LOW로 남는다(승급 경로가 없다). TABLET은
   * "이 deviceId가 사업장에 등록된 활성 키오스크인가"로, PC는 IP
   * 허용목록(IpAllowlistGuard)이 이미 이 요청을 걸러낸 뒤라는 전제로
   * 무조건 신뢰 처리한다. GPS/NFC/QR은 기존과 완전히 동일.
   */
  private async resolveDeviceTrust(employeeId: string, registrationMethod: string, deviceId: string): Promise<boolean> {
    if (registrationMethod === 'TABLET') {
      const device = await this.kioskDevicesRepo.findById(deviceId);
      return device?.status === 'ACTIVE';
    }
    if (registrationMethod === 'PC') {
      return true;
    }
    return (await this.deviceBindingService.resolve(employeeId, deviceId)).trusted;
  }

  async createBulk(employeeId: string, employeeNo: string, dto: CreatePunchBulkDto): Promise<BulkItemResult[]> {
    // 배치 내 고유 deviceId별로 기기 바인딩을 메모이즈한다 — resolve()가
    // 자체 트랜잭션+advisory lock을 여는데, 오프라인 큐는 보통 기기 1대분이다.
    const deviceTrustCache = new Map<string, boolean>();
    const siteCache = new Map<string, Site>();
    const results: BulkItemResult[] = [];

    for (let index = 0; index < dto.items.length; index += 1) {
      const item = dto.items[index];
      try {
        let site = siteCache.get(item.siteId);
        if (!site) {
          site = await this.getSite(item.siteId);
          siteCache.set(item.siteId, site);
        }

        const trustCacheKey = `${item.registrationMethod}:${item.deviceId}`;
        let trusted = deviceTrustCache.get(trustCacheKey);
        if (trusted === undefined) {
          trusted = await this.resolveDeviceTrust(employeeId, item.registrationMethod, item.deviceId);
          deviceTrustCache.set(trustCacheKey, trusted);
        }

        const result = await this.processOne(
          employeeId,
          employeeNo,
          site,
          item,
          trusted,
          true,
          dto.lastKnownServerSyncTime,
        );
        results.push({
          index,
          status: result.duplicate ? 'DUPLICATE' : 'CREATED',
          punchId: result.punch.id,
          verificationLevel: result.punch.verificationLevel,
        });
      } catch (err) {
        results.push({ index, status: 'FAILED', error: err instanceof Error ? err.message : String(err) });
      }
    }

    return results;
  }

  private async getSite(siteId: string): Promise<Site> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new PunchSiteNotFoundError(siteId);
    return site;
  }

  private async processOne(
    employeeId: string,
    employeeNo: string,
    site: Site,
    dto: CreatePunchDto,
    deviceTrusted: boolean,
    isOffline: boolean,
    lastKnownServerSyncTime?: string,
  ): Promise<PunchCreateResult> {
    const recordedAt = new Date(dto.recordedAt);
    const workDate = deriveWorkDate(recordedAt);
    const policy = await this.policyResolver.resolve(site.id, workDate);

    // 지오펜스 판정을 먼저 끝낸다 — 인쇄용 일단위 QR(수정사항)은 검증 시 Wi-Fi/Cell
    // 대역신호 대신 이 결과를 쓰므로, 더 이상 두 평가를 독립적으로 병렬 실행할 수 없다.
    const geofenceEval = await this.geofenceService.evaluate(
      site,
      dto.location,
      employeeId,
      workDate,
      policy.geofenceAccuracyThresholdM,
      dto.outOfGeofenceReason,
    );
    const verificationEval = await this.qrNfcService.evaluate(
      site,
      dto.registrationMethod,
      dto.qrOrNfcToken,
      deviceTrusted,
      dto.wifiBssid,
      dto.cellId,
      policy,
      deriveWorkDateString(recordedAt),
      !geofenceEval.isLow,
    );

    const flags = new Set<string>([...geofenceEval.integrityFlags, ...verificationEval.integrityFlags]);
    if (!deviceTrusted) flags.add('DEVICE_NOT_TRUSTED');

    // Android/iOS 부정사용 신호(동기, 클라이언트가 이미 보낸 값을 그대로 옮긴다).
    if (dto.platform === 'IOS') {
      // 불리언 false가 아니라 "탐지 불가"임을 이 문자열 토큰으로 명시한다.
      flags.add('MOCK_LOCATION_NOT_SUPPORTED');
    } else if (dto.platform === 'ANDROID' && dto.androidIntegrityFlags) {
      if (dto.androidIntegrityFlags.mockLocationSuspected) flags.add('MOCK_LOCATION_SUSPECTED');
      if (dto.androidIntegrityFlags.developerModeEnabled) flags.add('DEVELOPER_MODE_ENABLED');
      if (dto.androidIntegrityFlags.rootedOrJailbroken) flags.add('DEVICE_ROOTED');
    }

    const receivedAt = new Date();
    if (isOffline) {
      // 오프라인 큐 지연 자체는 부정 신호로 보지 않는다 — offline_queue_delay_threshold_hours를
      // 넘어도 플래그를 추가하지 않는다(요구사항 명시).
      if (lastKnownServerSyncTime) {
        const syncAt = new Date(lastKnownServerSyncTime);
        const toleranceMs = policy.deviceClockRollbackToleranceSeconds * 1000;
        if (recordedAt.getTime() < syncAt.getTime() - toleranceMs) {
          flags.add('DEVICE_CLOCK_ROLLBACK_SUSPECTED');
        }
      }
    } else {
      const gapMinutes = (receivedAt.getTime() - recordedAt.getTime()) / 60000;
      if (gapMinutes > policy.onlinePunchDelayThresholdMinutes) {
        flags.add('UNEXPLAINED_TIME_GAP');
      }
    }

    const isLow = geofenceEval.isLow || verificationEval.isLow || !deviceTrusted;
    const verificationLevel: VerificationLevel = isLow ? 'LOW' : 'NORMAL';

    const idempotencyKey = sha256(
      `${employeeNo}|${dto.punchType}|${truncateToMinuteIso(recordedAt)}|${dto.deviceId}`,
    );

    const { punch, duplicate } = await this.punchRawRepo.createIdempotent({
      employeeId,
      siteId: site.id,
      punchType: dto.punchType,
      recordedAt,
      workDate,
      idempotencyKey,
      verificationLevel,
      registrationMethod: dto.registrationMethod,
      deviceId: dto.deviceId,
      integrityFlags: [...flags],
      clientEventId: dto.clientEventId,
      reviewNote: geofenceEval.reviewNote,
    });

    if (!duplicate) {
      if (dto.location) {
        const purgeScheduledAt = new Date(workDate.getTime() + policy.locationRetentionDays * 86_400_000);
        await this.punchLocationRepo.create({
          punchId: punch.id,
          lat: dto.location.lat,
          lng: dto.location.lng,
          accuracyM: dto.location.accuracyM,
          purgeScheduledAt,
        });
      }

      await Promise.all([
        this.recalcTrigger.onPunchSaved(employeeId, deriveWorkDateString(recordedAt)),
        this.fraudTrigger.onPunchSaved(punch.id, employeeId),
      ]);
    }

    return { punch, duplicate };
  }
}
