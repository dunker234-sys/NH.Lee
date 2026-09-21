import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';

export interface DeviceBindingResult {
  trusted: boolean;
  isNewDevice: boolean;
}

/**
 * 기기 신뢰 판정. 이 직원의 첫 로그인 기기는 자동으로 trusted=true가 되고,
 * 이후 새 기기는 trusted=false로 등록되지만 로그인 자체는 절대 막지 않는다
 * (CLAUDE.md: 기기 교체로 근로 사실 기록이 막히면 안 된다). advisory lock으로
 * "같은 직원이 동시에 두 기기에서 첫 로그인"하는 경쟁 조건을 막는다 — 단순
 * COUNT→INSERT로는 둘 다 trusted=true가 될 수 있다.
 */
@Injectable()
export class DeviceBindingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async resolve(employeeId: string, deviceId: string): Promise<DeviceBindingResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeId}))`;

      const existing = await tx.deviceBinding.findUnique({
        where: { employeeId_deviceId: { employeeId, deviceId } },
      });
      if (existing) {
        await tx.deviceBinding.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date() },
        });
        return { trusted: existing.trusted, isNewDevice: false };
      }

      const hasAnyBinding = await tx.deviceBinding.findFirst({ where: { employeeId } });
      const trusted = !hasAnyBinding;

      await tx.deviceBinding.create({ data: { employeeId, deviceId, trusted } });

      return { trusted, isNewDevice: true };
    });

    if (result.isNewDevice && !result.trusted) {
      await this.auditLog.write({
        actorPrincipal: employeeId,
        actorRole: 'EMPLOYEE',
        eventType: 'DEVICE_BOUND',
        resourceType: 'device_binding',
        resourceId: employeeId,
        reason: `미등록 기기(${deviceId})에서 로그인 — 검토 큐 등록, 이후 타각은 verification_level=LOW로 기록`,
      });
    }

    return result;
  }
}
