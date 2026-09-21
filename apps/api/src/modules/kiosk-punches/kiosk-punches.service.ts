import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { KioskDevice, RegistrationMethod } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { KioskPolicyResolverService } from '../../common/policy/kiosk-policy-resolver.service';
import { maskName } from '../../common/text/name-mask.util';
import { deriveWorkDate } from '../../common/time/work-date.util';
import { NotificationService } from '../notifications/notification.service';
import { PunchesService } from '../punches/punches.service';
import { QrSecretProvisioningService } from '../punches/qr-secret-provisioning.service';
import { CreatePunchDto } from '../punches/dto/create-punch.dto';
import { InvalidPinError, PinLockedError, PinNotSetError } from './errors/kiosk-punch-errors';
import { KioskPunchBulkDto, KioskPunchDto } from './dto/kiosk-punch.dto';

export interface KioskPunchResponse {
  punchId: string;
  punchType: string;
  maskedName: string;
  verificationLevel: string;
  completedAt: string;
}

export interface KioskBulkItemResult {
  index: number;
  status: 'CREATED' | 'DUPLICATE' | 'FAILED';
  punchId?: string;
  verificationLevel?: string;
  error?: string;
}

interface ResolvedEmployee {
  employeeId: string;
  employeeNo: string;
  name: string;
}

/**
 * 키오스크 PIN 검증+타각. AuthService.recordFailedAttempt()의 원자적
 * increment 패턴을 PIN 전용 컬럼(EmployeeCredential.pin*)에 그대로
 * 미러링한다 — 비밀번호 잠금과 별개 카운터를 쓴다(threat model이 다르다).
 */
@Injectable()
export class KioskPunchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly punchesService: PunchesService,
    private readonly policyResolver: KioskPolicyResolverService,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly qrSecretProvisioningService: QrSecretProvisioningService,
  ) {}

  async punchOne(kioskDevice: KioskDevice, dto: KioskPunchDto): Promise<KioskPunchResponse> {
    const resolved = await this.verifyPin(kioskDevice, dto.employeeNo, dto.pin);
    const punchDto = this.toCreatePunchDto(kioskDevice, dto);
    const result = await this.punchesService.create(resolved.employeeId, resolved.employeeNo, punchDto);

    return {
      punchId: result.punch.id,
      punchType: result.punch.punchType,
      maskedName: maskName(resolved.name),
      verificationLevel: result.punch.verificationLevel,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * 오프라인 복구 재전송. PunchesService.createBulk()(단일 employeeId 전제)를
   * 그대로 쓸 수 없다 — 공용 키오스크의 오프라인 큐는 여러 직원이 섞여
   * 쌓일 수 있으므로 항목별로 PIN을 검증하고 항목별로 create()를 호출한다.
   */
  async punchBulk(kioskDevice: KioskDevice, dto: KioskPunchBulkDto): Promise<{ results: KioskBulkItemResult[] }> {
    const results: KioskBulkItemResult[] = [];

    for (let index = 0; index < dto.items.length; index += 1) {
      const item = dto.items[index];
      try {
        const resolved = await this.verifyPin(kioskDevice, item.employeeNo, item.pin);
        const punchDto = this.toCreatePunchDto(kioskDevice, item);
        const result = await this.punchesService.create(resolved.employeeId, resolved.employeeNo, punchDto);
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

    return { results };
  }

  async getCurrentQrCode(siteId: string): Promise<{ code: string; periodSeconds: number; expiresAt: string }> {
    return this.qrSecretProvisioningService.getCurrentCode(siteId);
  }

  private toCreatePunchDto(kioskDevice: KioskDevice, dto: KioskPunchDto): CreatePunchDto {
    return {
      punchType: dto.punchType,
      recordedAt: dto.recordedAt,
      siteId: kioskDevice.siteId,
      registrationMethod: 'TABLET' as RegistrationMethod,
      deviceId: kioskDevice.id,
      clientEventId: dto.clientEventId,
    } as CreatePunchDto;
  }

  private async verifyPin(kioskDevice: KioskDevice, employeeNo: string, pin: string): Promise<ResolvedEmployee> {
    const employee = await this.prisma.employee.findUnique({
      where: { employeeNo },
      include: { credential: true },
    });

    // 사번 존재 여부를 노출하지 않는다 — AuthService.InvalidCredentialsError와 같은 원칙.
    if (!employee || employee.status !== 'ACTIVE' || !employee.credential) throw new InvalidPinError();
    if (!employee.credential.pinHash) throw new PinNotSetError();
    if (employee.credential.pinLockedUntil && employee.credential.pinLockedUntil.getTime() > Date.now()) {
      throw new PinLockedError(employee.credential.pinLockedUntil);
    }

    const ok = await bcrypt.compare(pin, employee.credential.pinHash);
    if (!ok) {
      await this.recordFailedPinAttempt(kioskDevice, employee.id, employee.employeeNo, employee.name, employee.role);
      throw new InvalidPinError();
    }

    await this.prisma.employeeCredential.update({
      where: { employeeId: employee.id },
      data: { pinFailedAttempts: 0, pinLockedUntil: null },
    });

    return { employeeId: employee.id, employeeNo: employee.employeeNo, name: employee.name };
  }

  private async recordFailedPinAttempt(
    kioskDevice: KioskDevice,
    employeeId: string,
    employeeNo: string,
    employeeName: string,
    employeeRole: string,
  ): Promise<void> {
    const policy = await this.policyResolver.resolve(kioskDevice.siteId, deriveWorkDate(new Date()));

    const updated = await this.prisma.employeeCredential.update({
      where: { employeeId },
      data: { pinFailedAttempts: { increment: 1 } },
    });

    if (updated.pinFailedAttempts >= policy.pinMaxFailedAttempts) {
      const lockedUntil = new Date(Date.now() + policy.pinLockoutMinutes * 60_000);
      await this.prisma.employeeCredential.update({ where: { employeeId }, data: { pinLockedUntil: lockedUntil } });

      await this.auditLog.write({
        actorPrincipal: employeeNo,
        actorRole: employeeRole,
        eventType: 'KIOSK_PIN_LOCKED',
        resourceType: 'employee_credential',
        resourceId: employeeId,
        reason: `키오스크(${kioskDevice.label}, ${kioskDevice.id})에서 PIN 무차별 대입 추정 — ${lockedUntil.toISOString()}까지 잠금`,
      });

      await this.notifyLockout(kioskDevice, employeeName, employeeNo);
    }
  }

  private async notifyLockout(kioskDevice: KioskDevice, employeeName: string, employeeNo: string): Promise<void> {
    const today = deriveWorkDate(new Date());
    const managers = await this.prisma.employee.findMany({
      where: {
        role: 'SITE_MANAGER',
        status: 'ACTIVE',
        siteAssignments: { some: { siteId: kioskDevice.siteId, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] } },
      },
    });

    // 수신자가 0명이어도 잠금 자체는 이미 걸렸다 — 알림 실패가 보안 조치를 되돌리지 않는다.
    for (const manager of managers) {
      await this.notificationService.notify('KIOSK_PIN_LOCKOUT', manager.id, {
        employeeName,
        employeeNo,
        kioskLabel: kioskDevice.label,
      });
    }
  }
}
