import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { addDays, dateOnly } from '../../common/time/week.util';

/**
 * labor_agreement.agreement_type은 자유 문자열이라(스키마 §4) 유연근로제 유형을
 * 가리는 컨벤션이 아직 없었다 — packages/core-rules의 flexible-work/ 모듈
 * 파일명에 대응시켜 이번 STEP에서 정한다. 실제 유형별 판정(§3 계산)은 범위
 * 밖이라, 여기서는 "이 주에 활성 유연근로 합의가 있는가"만 판단한다.
 */
export const FLEXIBLE_WORK_AGREEMENT_TYPES = [
  'FLEXIBLE_BIWEEKLY',
  'FLEXIBLE_QUARTERLY',
  'FLEXIBLE_SEMIANNUAL',
  'SELECTIVE_MONTHLY',
] as const;

@Injectable()
export class LaborAgreementResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /** 그 주(월~일)에 걸쳐 활성인 유연근로 합의가 있으면 true. */
  async hasActiveFlexibleWorkAgreement(employeeId: string, weekStartDate: string): Promise<boolean> {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { primarySiteId: true },
    });
    const weekEndDate = addDays(weekStartDate, 6);
    const weekStart = dateOnly(weekStartDate);
    const weekEnd = dateOnly(weekEndDate);

    const agreement = await this.prisma.laborAgreement.findFirst({
      where: {
        agreementType: { in: [...FLEXIBLE_WORK_AGREEMENT_TYPES] },
        AND: [
          { OR: [{ siteId: employee.primarySiteId }, { siteId: null }] },
          { effectiveStartDate: { lte: weekEnd } },
          { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: weekStart } }] },
        ],
      },
    });
    return agreement != null;
  }
}
