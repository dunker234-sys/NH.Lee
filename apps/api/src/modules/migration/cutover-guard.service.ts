import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CutoverReadiness {
  ready: boolean;
  totalRecords: number;
  unresolvedCount: number;
}

/**
 * payroll-close-guard.service.ts와 같은 형태의 읽기 전용 게이트 —
 * "개통 승인 가능 여부"만 판정하고 차단 자체는 호출부(CutoverApprovalService)
 * 가 한다. totalRecords===0(대사를 아예 안 한 상태)도 준비되지 않은 것으로
 * 취급한다 — 대사를 건너뛴 사업장이 통과해버리는 것을 막는다.
 */
@Injectable()
export class CutoverGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async isReadyForApproval(siteId: string): Promise<CutoverReadiness> {
    const [totalRecords, unresolvedCount] = await Promise.all([
      this.prisma.migrationReconciliationRecord.count({ where: { siteId } }),
      this.prisma.migrationReconciliationRecord.count({ where: { siteId, diff: { not: 0 } } }),
    ]);
    return { ready: totalRecords > 0 && unresolvedCount === 0, totalRecords, unresolvedCount };
  }
}
