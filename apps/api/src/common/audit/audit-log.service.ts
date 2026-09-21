import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeAuditRecordHash } from './audit-record-hash.util';

export interface AuditLogWriteInput {
  actorPrincipal: string;
  actorRole: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  /** STEP8: 이벤트가 누구의 근태에 대한 것인지(actorPrincipal=행위자와 다를 수 있다). */
  subjectEmployeeId?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  reason?: string;
  jobId?: string;
  scopeBypassed?: boolean;
}

/**
 * audit_log(상태 변경 이벤트 전용)의 유일한 쓰기 경로.
 * 해시 체인(prevHash → recordHash)을 실제로 채운다. 해시 입력 조립은
 * audit-record-hash.util.ts로 뽑아 STEP8 무결성 검증 배치와 절대 갈라지지
 * 않게 한다(같은 함수를 재사용).
 * 삽입은 advisory lock으로 직렬화해 prevHash 조회 후 삽입 사이의 경합을 막는다.
 * 이 메서드가 자체 $transaction을 열기 때문에, 호출자가 자신의 업무
 * 트랜잭션 안에서 부른 것이 아닌 한 요청 트랜잭션과 항상 분리되어 있다.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: AuditLogWriteInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('audit_log'))`;

      const previous = await tx.auditLog.findFirst({
        orderBy: { seq: 'desc' },
        select: { recordHash: true },
      });
      const prevHash = previous?.recordHash ?? null;
      const occurredAt = new Date();

      const recordHash = computeAuditRecordHash({
        actorPrincipal: input.actorPrincipal,
        actorRole: input.actorRole,
        eventType: input.eventType,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        beforeValue: input.beforeValue,
        afterValue: input.afterValue,
        reason: input.reason,
        occurredAt,
        prevHash,
      });

      await tx.auditLog.create({
        data: {
          actorPrincipal: input.actorPrincipal,
          actorRole: input.actorRole,
          eventType: input.eventType,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          subjectEmployeeId: input.subjectEmployeeId,
          beforeValue: input.beforeValue as Prisma.InputJsonValue | undefined,
          afterValue: input.afterValue as Prisma.InputJsonValue | undefined,
          reason: input.reason,
          occurredAt,
          prevHash,
          recordHash,
          jobId: input.jobId,
          scopeBypassed: input.scopeBypassed ?? false,
        },
      });
    });
  }
}
