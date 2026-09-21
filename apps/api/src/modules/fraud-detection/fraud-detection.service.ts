import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { haversineDistanceMeters } from '../../common/geo/haversine.util';
import { PunchPolicy, PunchPolicyResolverService } from '../../common/policy/punch-policy-resolver.service';
import { PunchFraudSignalRepository } from './punch-fraud-signal.repository';

type PunchWithLocation = Prisma.PunchRawGetPayload<{ include: { location: true } }>;

/**
 * 부정사용 비동기 탐지 3종. 전부 punch_fraud_signal에만 기록한다 — punch_raw는
 * append-only라 사후 갱신 자체가 불가능하다(§Context Finding A와 같은 제약).
 */
@Injectable()
export class FraudDetectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fraudSignalRepo: PunchFraudSignalRepository,
    private readonly policyResolver: PunchPolicyResolverService,
  ) {}

  async detectForPunch(punchId: string): Promise<void> {
    const punch = await this.prisma.punchRaw.findUniqueOrThrow({
      where: { id: punchId },
      include: { location: true },
    });
    const policy = await this.policyResolver.resolve(punch.siteId, punch.workDate);

    await Promise.all([
      this.checkImpossibleTravelSpeed(punch, policy),
      this.checkRepeatedCoordinates(punch, policy),
      this.checkSharedDevice(punch, policy),
    ]);
  }

  /** 직전 타각 1건만 본다(윈도우 아님) — workDate로 먼저 거르면 자정 넘는 이동을 놓친다. */
  private async checkImpossibleTravelSpeed(punch: PunchWithLocation, policy: PunchPolicy): Promise<void> {
    if (!punch.location) return;

    const previous = await this.prisma.punchRaw.findFirst({
      where: { employeeId: punch.employeeId, recordedAt: { lt: punch.recordedAt } },
      orderBy: { recordedAt: 'desc' },
      include: { location: true },
    });
    if (!previous?.location) return;

    const elapsedHours = (punch.recordedAt.getTime() - previous.recordedAt.getTime()) / 3_600_000;
    if (elapsedHours <= 0) return;

    const distanceM = haversineDistanceMeters(
      { lat: previous.location.lat.toNumber(), lng: previous.location.lng.toNumber() },
      { lat: punch.location.lat.toNumber(), lng: punch.location.lng.toNumber() },
    );
    const speedKmh = distanceM / 1000 / elapsedHours;
    if (speedKmh > policy.impossibleTravelSpeedKmh) {
      await this.fraudSignalRepo.create({
        punchId: punch.id,
        employeeId: punch.employeeId,
        signalType: 'IMPOSSIBLE_TRAVEL_SPEED',
        detail: { previousPunchId: previous.id, distanceM, elapsedHours, speedKmh, thresholdKmh: policy.impossibleTravelSpeedKmh },
      });
    }
  }

  private async checkRepeatedCoordinates(punch: PunchWithLocation, policy: PunchPolicy): Promise<void> {
    if (!punch.location) return;
    const { lat, lng } = punch.location;

    const lookbackStart = new Date(punch.recordedAt.getTime() - policy.repeatedCoordinateLookbackDays * 86_400_000);
    const recent = await this.prisma.punchRaw.findMany({
      where: {
        employeeId: punch.employeeId,
        recordedAt: { gte: lookbackStart, lte: punch.recordedAt },
      },
      include: { location: true },
    });
    const matches = recent.filter((p) => p.location && lat.equals(p.location.lat) && lng.equals(p.location.lng));

    if (matches.length > policy.repeatedCoordinateMaxCount) {
      await this.fraudSignalRepo.create({
        punchId: punch.id,
        employeeId: punch.employeeId,
        signalType: 'REPEATED_EXACT_COORDINATES',
        detail: {
          matchCount: matches.length,
          thresholdCount: policy.repeatedCoordinateMaxCount,
          lookbackDays: policy.repeatedCoordinateLookbackDays,
        },
      });
    }
  }

  private async checkSharedDevice(punch: PunchWithLocation, policy: PunchPolicy): Promise<void> {
    const lookbackStart = new Date(punch.receivedAt.getTime() - policy.sharedDeviceLookbackHours * 3_600_000);
    const recentEmployees = await this.prisma.punchRaw.findMany({
      where: { deviceId: punch.deviceId, receivedAt: { gte: lookbackStart } },
      select: { employeeId: true },
      distinct: ['employeeId'],
    });

    if (recentEmployees.length >= 2) {
      await this.fraudSignalRepo.create({
        punchId: punch.id,
        employeeId: punch.employeeId,
        signalType: 'SHARED_DEVICE_MULTIPLE_EMPLOYEES',
        detail: {
          deviceId: punch.deviceId,
          distinctEmployeeCount: recentEmployees.length,
          lookbackHours: policy.sharedDeviceLookbackHours,
        },
      });
    }
  }
}
