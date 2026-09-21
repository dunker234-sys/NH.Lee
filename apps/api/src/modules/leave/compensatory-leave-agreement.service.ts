import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** §57 보상휴가 게이트 — labor-agreement-resolver.service.ts의
 * hasActiveFlexibleWorkAgreement()와 동일 쿼리 패턴, agreementType만 다르다. */
@Injectable()
export class CompensatoryLeaveAgreementService {
  constructor(private readonly prisma: PrismaService) {}

  async hasActiveAgreement(siteId: string, asOfDate: Date): Promise<boolean> {
    const agreement = await this.prisma.laborAgreement.findFirst({
      where: {
        agreementType: 'COMPENSATORY_LEAVE',
        AND: [
          { OR: [{ siteId }, { siteId: null }] },
          { effectiveStartDate: { lte: asOfDate } },
          { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }] },
        ],
      },
    });
    return agreement != null;
  }
}
