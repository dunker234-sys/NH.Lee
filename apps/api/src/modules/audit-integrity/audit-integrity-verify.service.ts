import { Injectable } from '@nestjs/common';
import { computeAuditRecordHash } from '../../common/audit/audit-record-hash.util';
import { computeMerkleRoot } from '../../common/audit/merkle.util';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface IntegrityMismatch {
  type: 'HASH_MISMATCH' | 'CHAIN_BROKEN' | 'MERKLE_MISMATCH';
  detail: string;
  seq?: string;
}

export interface IntegrityReport {
  ok: boolean;
  checkedCount: number;
  mismatches: IntegrityMismatch[];
}

/**
 * ROADMAP STEP8 완료조건4 — "무결성 검증 배치가 정상 데이터에 오탐을 내지
 * 않는다." AuditLogService.write()와 정확히 같은 해시 조립 함수
 * (computeAuditRecordHash)를 재사용해, 정상 데이터에서는 구조적으로 오탐이
 * 날 수 없게 한다(다른 방식으로 재계산하면 필드 순서/null 처리 하나만
 * 어긋나도 거짓 양성이 난다).
 */
@Injectable()
export class AuditIntegrityVerifyService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(periodStart: Date, periodEnd: Date): Promise<IntegrityReport> {
    const rows = await this.prisma.auditLog.findMany({
      where: { occurredAt: { gte: periodStart, lt: periodEnd } },
      orderBy: { seq: 'asc' },
    });

    const mismatches: IntegrityMismatch[] = [];
    let expectedPrevHash: string | null = await this.recordHashImmediatelyBefore(rows[0]?.seq);

    for (const row of rows) {
      if (row.prevHash !== expectedPrevHash) {
        mismatches.push({
          type: 'CHAIN_BROKEN',
          seq: row.seq.toString(),
          detail: `prevHash 불일치 — 예상 ${expectedPrevHash ?? 'null'}, 실제 ${row.prevHash ?? 'null'}`,
        });
      }

      const recomputed = computeAuditRecordHash({
        actorPrincipal: row.actorPrincipal,
        actorRole: row.actorRole,
        eventType: row.eventType,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        beforeValue: row.beforeValue,
        afterValue: row.afterValue,
        reason: row.reason,
        occurredAt: row.occurredAt,
        prevHash: row.prevHash,
      });
      if (recomputed !== row.recordHash) {
        mismatches.push({
          type: 'HASH_MISMATCH',
          seq: row.seq.toString(),
          detail: 'record_hash가 저장된 필드로부터 재계산한 값과 다릅니다.',
        });
      }

      expectedPrevHash = row.recordHash;
    }

    mismatches.push(...(await this.verifyMerkleRoots(periodStart, periodEnd)));

    return { ok: mismatches.length === 0, checkedCount: rows.length, mismatches };
  }

  private async recordHashImmediatelyBefore(seq: bigint | undefined): Promise<string | null> {
    if (seq === undefined) return null;
    const before = await this.prisma.auditLog.findFirst({
      where: { seq: { lt: seq } },
      orderBy: { seq: 'desc' },
      select: { recordHash: true },
    });
    return before?.recordHash ?? null;
  }

  private async verifyMerkleRoots(periodStart: Date, periodEnd: Date): Promise<IntegrityMismatch[]> {
    const sealedRoots = await this.prisma.auditLogMerkleRoot.findMany({
      where: { periodStart: { gte: periodStart }, periodEnd: { lte: periodEnd } },
      orderBy: { periodStart: 'asc' },
    });

    const mismatches: IntegrityMismatch[] = [];
    for (const sealed of sealedRoots) {
      const rows = await this.prisma.auditLog.findMany({
        where: { occurredAt: { gte: sealed.periodStart, lt: sealed.periodEnd } },
        orderBy: { seq: 'asc' },
        select: { recordHash: true },
      });
      const recomputedRoot = computeMerkleRoot(rows.map((r) => r.recordHash));
      if (recomputedRoot !== sealed.merkleRoot) {
        mismatches.push({
          type: 'MERKLE_MISMATCH',
          detail: `봉인된 Merkle 루트(${sealed.periodStart.toISOString()}~${sealed.periodEnd.toISOString()})가 현재 데이터로 재계산한 값과 다릅니다.`,
        });
      }
    }
    return mismatches;
  }
}
