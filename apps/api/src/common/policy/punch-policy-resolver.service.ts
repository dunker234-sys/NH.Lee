import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type QrVerificationPolicy = 'NFC_ONLY' | 'QR_WITH_AUX_CHECK';

export interface PunchPolicy {
  geofenceAccuracyThresholdM: number;
  qrTotpPeriodSeconds: number;
  qrVerificationPolicy: QrVerificationPolicy;
  offlineQueueDelayThresholdHours: number;
  impossibleTravelSpeedKmh: number;
  repeatedCoordinateLookbackDays: number;
  repeatedCoordinateMaxCount: number;
  sharedDeviceLookbackHours: number;
  deviceClockRollbackToleranceSeconds: number;
  onlinePunchDelayThresholdMinutes: number;
  locationRetentionDays: number;
}

const KEY_MAP: Record<keyof PunchPolicy, string> = {
  geofenceAccuracyThresholdM: 'geofence_accuracy_threshold_m',
  qrTotpPeriodSeconds: 'qr_totp_period_seconds',
  qrVerificationPolicy: 'qr_verification_policy',
  offlineQueueDelayThresholdHours: 'offline_queue_delay_threshold_hours',
  impossibleTravelSpeedKmh: 'impossible_travel_speed_kmh',
  repeatedCoordinateLookbackDays: 'repeated_coordinate_lookback_days',
  repeatedCoordinateMaxCount: 'repeated_coordinate_max_count',
  sharedDeviceLookbackHours: 'shared_device_lookback_hours',
  deviceClockRollbackToleranceSeconds: 'device_clock_rollback_tolerance_seconds',
  onlinePunchDelayThresholdMinutes: 'online_punch_delay_threshold_minutes',
  locationRetentionDays: 'location_retention_days',
};

/**
 * punch_raw 관련 policy_config(snake_case 키)를 조립한다. common/에 두는
 * 이유: modules/punches(동기 검증)와 modules/fraud-detection(비동기 탐지)이
 * 둘 다 같은 정책값을 읽어야 하는데, 둘 중 한 모듈 안에 두면 다른 쪽이
 * 그 모듈을 import해야 해서 순환 의존이 생긴다.
 * PolicyConfigResolverService(recalculation 모듈)는 별개 camelCase 키
 * 네임스페이스를 다루므로 재사용하지 않는다 — policy_config 테이블은
 * 공유하되 두 리졸버는 서로 다른 키 집합만 읽는다.
 */
@Injectable()
export class PunchPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 키마다 site→전사 순으로 최대 2회씩(총 22회) 조회하던 예전 구현은 100건
   * 동시 요청 P95 측정에서 실제 병목으로 확인됐다(연결 풀 경합) — 필요한
   * 11개 키를 site+전사 값 전부 한 번에 가져와 메모리에서 우선순위를
   * 적용하는 단일 쿼리로 바꿨다. 결과는 동일하다.
   */
  async resolve(siteId: string, asOfDate: Date): Promise<PunchPolicy> {
    const entries = Object.entries(KEY_MAP) as [keyof PunchPolicy, string][];
    const keys = entries.map(([, key]) => key);

    const rows = await this.prisma.policyConfig.findMany({
      where: {
        key: { in: keys },
        AND: [
          { OR: [{ siteId }, { siteId: null }] },
          { effectiveStartDate: { lte: asOfDate } },
          { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }] },
        ],
      },
      orderBy: { effectiveStartDate: 'desc' },
    });

    const bestValueByKey = new Map<string, unknown>();
    // 정렬 순서(최신 우선)를 유지한 채 사업장 오버라이드를 먼저 채우고,
    // 그다음 전사 기본값으로 남은 키만 채운다 — site가 항상 이긴다.
    for (const row of rows) {
      if (row.siteId === siteId && !bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value);
    }
    for (const row of rows) {
      if (row.siteId === null && !bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value);
    }

    const result = {} as PunchPolicy;
    for (const [field, key] of entries) {
      if (!bestValueByKey.has(key)) {
        throw new Error(
          `정책값 '${key}'를 policy_config에서 찾을 수 없습니다(사업장 ${siteId}, 기준일 ${asOfDate.toISOString()}). ` +
            `임의 기본값으로 대체하지 않습니다 — CLAUDE.md 절대 규칙 4.`,
        );
      }
      (result as unknown as Record<string, unknown>)[field] = bestValueByKey.get(key);
    }
    return result;
  }
}
