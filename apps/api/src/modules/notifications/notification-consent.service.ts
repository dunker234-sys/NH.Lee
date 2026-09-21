import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * NOTIFICATION 동의 판정. LOCATION_COLLECTION과 달리 옵트인을 강제하는
 * 법령이 없어 옵트아웃 기본이다 — 레코드가 없으면 수신 동의로 간주한다
 * (사전 동의 UI가 없는 지금 전 직원의 알림 기능이 죽은 채로 시작하는 것을
 * 막기 위해서다). PAUSED/WITHDRAWN만 억제 신호다.
 */
@Injectable()
export class NotificationConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async isSuppressed(employeeId: string): Promise<boolean> {
    const latest = await this.prisma.consent.findFirst({
      where: { employeeId, consentType: 'NOTIFICATION' },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return false;
    return latest.status === 'PAUSED' || latest.status === 'WITHDRAWN';
  }
}
