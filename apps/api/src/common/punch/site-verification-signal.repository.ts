import { Injectable } from '@nestjs/common';
import { SiteVerificationSignalType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SiteVerificationSignalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(siteId: string, signalType: SiteVerificationSignalType, value: string) {
    return this.prisma.siteVerificationSignal.findFirst({
      where: { siteId, signalType, value, active: true },
    });
  }
}
