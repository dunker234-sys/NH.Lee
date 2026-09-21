import { Injectable } from '@nestjs/common';
import { AuditLogMerkleRoot } from '@prisma/client';
import { computeMerkleRoot } from '../../common/audit/merkle.util';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 1시간 단위 Merkle 루트 봉인(ROADMAP STEP8). 리프는 그 시간대 audit_log의
 * record_hash(seq asc 순서). 같은 시간대를 다시 봉인해도 멱등하도록
 * AuditLogMerkleRoot(periodStart, periodEnd)에 유니크 제약을 걸어뒀다(§1(d)).
 */
@Injectable()
export class AuditMerkleSealService {
  constructor(private readonly prisma: PrismaService) {}

  async sealHour(periodStart: Date): Promise<AuditLogMerkleRoot | null> {
    const periodEnd = new Date(periodStart.getTime() + 60 * 60 * 1000);
    const rows = await this.prisma.auditLog.findMany({
      where: { occurredAt: { gte: periodStart, lt: periodEnd } },
      orderBy: { seq: 'asc' },
      select: { recordHash: true },
    });

    const merkleRoot = computeMerkleRoot(rows.map((r) => r.recordHash));
    if (merkleRoot === null) return null; // 이벤트가 없는 시간대는 봉인하지 않는다.

    return this.prisma.auditLogMerkleRoot.upsert({
      where: { periodStart_periodEnd: { periodStart, periodEnd } },
      update: { merkleRoot, recordCount: rows.length },
      create: { periodStart, periodEnd, merkleRoot, recordCount: rows.length },
    });
  }

  listSealedRoots(periodStart: Date, periodEnd: Date): Promise<AuditLogMerkleRoot[]> {
    return this.prisma.auditLogMerkleRoot.findMany({
      where: { periodStart: { gte: periodStart }, periodEnd: { lte: periodEnd } },
      orderBy: { periodStart: 'asc' },
    });
  }
}
