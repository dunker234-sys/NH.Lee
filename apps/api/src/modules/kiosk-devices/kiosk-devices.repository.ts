import { Injectable } from '@nestjs/common';
import { KioskDevice, Site } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateKioskDeviceInput {
  siteId: string;
  label: string;
  credentialHash: string;
  createdBy: string;
}

/** kiosk_device에 대한 이 모듈의 유일한 접근 지점. */
@Injectable()
export class KioskDevicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateKioskDeviceInput): Promise<KioskDevice> {
    return this.prisma.kioskDevice.create({
      data: {
        siteId: input.siteId,
        label: input.label,
        credentialHash: input.credentialHash,
        createdBy: input.createdBy,
      },
    });
  }

  findByCredentialHash(credentialHash: string): Promise<KioskDevice | null> {
    return this.prisma.kioskDevice.findUnique({ where: { credentialHash } });
  }

  /** 페어링 화면(§2.2)이 사업장 이름을 보여줄 때만 쓰는 조인 조회. */
  findByCredentialHashWithSite(credentialHash: string): Promise<(KioskDevice & { site: Site }) | null> {
    return this.prisma.kioskDevice.findUnique({ where: { credentialHash }, include: { site: true } });
  }

  findById(id: string): Promise<KioskDevice | null> {
    return this.prisma.kioskDevice.findUnique({ where: { id } });
  }

  async revoke(id: string, revokedBy: string): Promise<KioskDevice> {
    return this.prisma.kioskDevice.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedBy },
    });
  }

  touchLastSeen(id: string): Promise<KioskDevice> {
    return this.prisma.kioskDevice.update({ where: { id }, data: { lastSeenAt: new Date() } });
  }
}
