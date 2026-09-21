import { Injectable } from '@nestjs/common';
import { Site } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { haversineDistanceMeters } from '../../common/geo/haversine.util';
import { GeoLocationDto } from './dto/create-punch.dto';

export interface GeofenceEvaluation {
  integrityFlags: string[];
  isLow: boolean;
  reviewNote?: string;
}

const EMPTY: GeofenceEvaluation = { integrityFlags: [], isLow: false };

/**
 * 지오펜스 검증. 반경은 Site.geofenceRadiusM을 단일 진실 소스로 쓴다
 * (policy_config.geofence_default_radius_m은 이번 STEP에서 신규 소비하지
 * 않는다 — 두 소스를 동시에 쓰지 않기 위해서다). 어떤 경우에도 거부하지
 * 않는다 — 항상 flags/LOW 판정만 반환한다.
 */
@Injectable()
export class GeofenceService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    site: Site,
    location: GeoLocationDto | undefined,
    employeeId: string,
    workDate: Date,
    accuracyThresholdM: number,
    outOfGeofenceReason: string | undefined,
  ): Promise<GeofenceEvaluation> {
    // PC/TABLET 등 위치 없는 등록수단은 지오펜스 판정을 할 수 없다 — 그냥 통과.
    if (!location) return EMPTY;

    const flags: string[] = [];
    if (location.accuracyM > accuracyThresholdM) {
      flags.push('LOCATION_ACCURACY_LOW');
    }

    if (site.lat == null || site.lng == null) {
      // 사업장 좌표가 아직 없다(이번 STEP에서 신설된 컬럼이라 기존 시드 데이터는
      // NULL일 수 있다) — 임의 좌표로 취급해 오판정하지 않고 불명확 처리한다.
      flags.push('SITE_COORDINATES_MISSING');
      return { integrityFlags: flags, isLow: true };
    }

    const distanceM = haversineDistanceMeters(
      { lat: site.lat.toNumber(), lng: site.lng.toNumber() },
      { lat: location.lat, lng: location.lng },
    );
    if (distanceM <= site.geofenceRadiusM) {
      return { integrityFlags: flags, isLow: flags.length > 0 };
    }

    // 반경 밖 — 승인된 외근/출장이 있으면 정상 처리(사업장 일치는 요구하지 않는다).
    const dispatch = await this.prisma.dispatchRequest.findFirst({
      where: { employeeId, status: 'APPROVED', startDate: { lte: workDate }, endDate: { gte: workDate } },
    });
    if (dispatch) {
      return { integrityFlags: flags, isLow: flags.length > 0 };
    }

    flags.push(outOfGeofenceReason ? 'OUT_OF_GEOFENCE_NO_DISPATCH' : 'OUT_OF_GEOFENCE_NO_DISPATCH_NO_REASON');
    return { integrityFlags: flags, isLow: true, reviewNote: outOfGeofenceReason };
  }
}
