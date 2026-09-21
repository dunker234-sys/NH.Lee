import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { LocationAccessLogRepository } from '../../common/access-log/location-access-log.repository';
import { RetentionPrismaService } from './retention-prisma.service';

const CHUNK_SIZE = 1000;

export interface PurgeResult {
  purgedCount: number;
}

/**
 * 위치정보 파기 배치 핵심 로직. punch_location에만 DELETE를 수행하고
 * (요구사항 그대로), punch_raw는 SELECT만 한다 — retention_job 롤 자체가
 * 그 외 권한이 없어 구조적으로도 강제된다(roles_post_migrate.sql).
 * 삭제 직전 확인자료(제16조②)를 LocationAccessLogRepository에 남기고,
 * 완료 후 파기 사실(건수·사유·실행자)을 audit_log에 1건 남긴다.
 */
@Injectable()
export class PunchLocationRetentionService {
  private readonly logger = new Logger(PunchLocationRetentionService.name);

  constructor(
    private readonly retentionPrisma: RetentionPrismaService,
    private readonly locationAccessLogRepo: LocationAccessLogRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  /** 매일 정기 스윕 — 보존기간(purgeScheduledAt)이 지난 전체 대상. */
  async purgeDue(): Promise<PurgeResult> {
    return this.purgeWhere({ purgeScheduledAt: { lte: new Date() } }, 'SCHEDULED_SWEEP');
  }

  /** §24④ 철회 시 지체없는 파기 — 보존기간 도래 여부와 무관하게 그 직원분만 즉시 삭제. */
  async purgeForEmployee(employeeId: string): Promise<PurgeResult> {
    const punches = await this.retentionPrisma.punchRaw.findMany({
      where: { employeeId },
      select: { id: true },
    });
    if (punches.length === 0) return { purgedCount: 0 };
    const punchIds = punches.map((p) => p.id);
    return this.purgeWhere({ punchId: { in: punchIds } }, 'CONSENT_WITHDRAWAL', employeeId);
  }

  private async purgeWhere(
    where: { purgeScheduledAt: { lte: Date } } | { punchId: { in: string[] } },
    reason: 'SCHEDULED_SWEEP' | 'CONSENT_WITHDRAWAL',
    subjectEmployeeId?: string,
  ): Promise<PurgeResult> {
    let totalPurged = 0;
    const periodStart = new Date();

    for (;;) {
      const candidates = await this.retentionPrisma.punchLocation.findMany({
        where,
        take: CHUNK_SIZE,
        select: { id: true, punchId: true },
      });
      if (candidates.length === 0) break;

      const punchIds = candidates.map((c) => c.punchId);
      const punches = await this.retentionPrisma.punchRaw.findMany({
        where: { id: { in: punchIds } },
        select: { id: true, employeeId: true },
      });
      const employeeByPunchId = new Map(punches.map((p) => [p.id, p.employeeId]));

      await this.locationAccessLogRepo.recordMany(
        candidates
          .filter((c) => employeeByPunchId.has(c.punchId))
          .map((c) => ({
            employeeId: employeeByPunchId.get(c.punchId) as string,
            punchLocationId: c.id,
            accessedBy: 'SYSTEM',
            accessPurpose: `위치정보 파기 배치(${reason})`,
          })),
      );

      const ids = candidates.map((c) => c.id);
      const result = await this.retentionPrisma.punchLocation.deleteMany({ where: { id: { in: ids } } });
      totalPurged += result.count;

      if (candidates.length < CHUNK_SIZE) break;
    }

    // BullMQ job.id는 UUID가 아닐 수 있어(예: 순번 문자열) audit_log.job_id
    // (UUID 컬럼)에 그대로 넣을 수 없다 — recalculation.service.ts와 동일한
    // 이유로 여기서 새 UUID를 만든다(runAsSystem의 기본 동작과 같은 원칙).
    await this.auditLog.write({
      actorPrincipal: 'SYSTEM',
      actorRole: 'SYSTEM',
      eventType: 'PUNCH_LOCATION_PURGED',
      resourceType: 'punch_location',
      subjectEmployeeId,
      reason: `${reason} — ${totalPurged}건 파기`,
      jobId: randomUUID(),
      afterValue: { purgedCount: totalPurged, reason, periodStart: periodStart.toISOString(), periodEnd: new Date().toISOString() },
      scopeBypassed: true,
    });

    this.logger.log(`위치정보 파기 완료: ${totalPurged}건 (사유: ${reason})`);
    return { purgedCount: totalPurged };
  }
}
