import { Injectable } from '@nestjs/common';
import { Consent, ConsentStatus, ConsentType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface RecordConsentEventInput {
  employeeId: string;
  consentType: ConsentType;
  status: ConsentStatus;
  policyVersion: string;
}

/**
 * consent에 대한 이 모듈의 유일한 접근 지점. 상태 전이마다 새 행을
 * 추가한다(update 없음) — "언제 멈추고 언제 재개했는지"가 §24② 이력
 * 요건의 핵심이라, 기존 행을 덮어쓰면 그 이력이 사라진다.
 */
@Injectable()
export class ConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(input: RecordConsentEventInput): Promise<Consent> {
    const now = new Date();
    return this.prisma.consent.create({
      data: {
        employeeId: input.employeeId,
        consentType: input.consentType,
        status: input.status,
        policyVersion: input.policyVersion,
        agreedAt: input.status === 'AGREED' ? now : null,
        pausedAt: input.status === 'PAUSED' ? now : null,
        withdrawnAt: input.status === 'WITHDRAWN' ? now : null,
      },
    });
  }

  async findLatest(employeeId: string, consentType: ConsentType): Promise<Consent | null> {
    return this.prisma.consent.findFirst({
      where: { employeeId, consentType },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findHistory(employeeId: string, consentType: ConsentType): Promise<Consent[]> {
    return this.prisma.consent.findMany({
      where: { employeeId, consentType },
      orderBy: { createdAt: 'desc' },
    });
  }
}
