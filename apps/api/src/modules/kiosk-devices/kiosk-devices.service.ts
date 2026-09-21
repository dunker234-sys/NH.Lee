import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { sha256 } from '../../common/crypto/hash.util';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { KioskDevicesRepository } from './kiosk-devices.repository';

export interface ProvisionResult {
  kioskDeviceId: string;
  siteId: string;
  label: string;
  /** 평문 페어링 토큰 — 이 응답에서 딱 한 번만 노출된다. 저장은 해시만.
   * QrSecretProvisioningService.provision()과 같은 "1회만 노출" 원칙. */
  credential: string;
}

/**
 * 키오스크 기기 프로비저닝/폐기. 발급된 원본 토큰은 페어링(§2.2)과 이후
 * 상시 인증(KioskDeviceGuard) 양쪽에 동일하게 쓰인다 — 별도 짧은
 * 코드→긴 토큰 교환 단계를 두지 않는다.
 */
@Injectable()
export class KioskDevicesService {
  constructor(
    private readonly repo: KioskDevicesRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async provision(principal: EmployeePrincipal, siteId: string, label: string): Promise<ProvisionResult> {
    const raw = randomBytes(32).toString('hex');
    const device = await this.repo.create({
      siteId,
      label,
      credentialHash: sha256(raw),
      createdBy: principal.employeeId,
    });

    await this.auditLog.write({
      actorPrincipal: principal.employeeNo,
      actorRole: principal.role,
      eventType: 'KIOSK_DEVICE_PROVISIONED',
      resourceType: 'kiosk_device',
      resourceId: device.id,
      reason: `사업장(${siteId}) 키오스크 "${label}" 신규 발급`,
    });

    return { kioskDeviceId: device.id, siteId: device.siteId, label: device.label, credential: raw };
  }

  async revoke(principal: EmployeePrincipal, kioskDeviceId: string): Promise<{ success: true }> {
    const existing = await this.repo.findById(kioskDeviceId);
    if (!existing) throw new NotFoundException({ code: 'KIOSK_DEVICE_NOT_FOUND' });
    if (existing.status === 'REVOKED') throw new ForbiddenException({ code: 'KIOSK_DEVICE_ALREADY_REVOKED' });

    await this.repo.revoke(kioskDeviceId, principal.employeeId);
    await this.auditLog.write({
      actorPrincipal: principal.employeeNo,
      actorRole: principal.role,
      eventType: 'KIOSK_DEVICE_REVOKED',
      resourceType: 'kiosk_device',
      resourceId: kioskDeviceId,
      reason: `키오스크 "${existing.label}" 폐기`,
    });
    return { success: true };
  }
}
