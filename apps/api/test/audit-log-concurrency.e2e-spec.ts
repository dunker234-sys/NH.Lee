import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AuditLogService } from '../src/common/audit/audit-log.service';
import { computeAuditRecordHash } from '../src/common/audit/audit-record-hash.util';
import { AuditIntegrityVerifyService } from '../src/modules/audit-integrity/audit-integrity-verify.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from '../src/modules/recalculation/queue.constants';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from '../src/modules/notifications/queue.constants';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';

const CONCURRENT_WRITES = 100;

/**
 * ROADMAP STEP8 완료조건3: "100건 동시 상태 변경에서도 해시 체인이
 * 분기하지 않는다." AuditLogService.write()의 advisory lock
 * (pg_advisory_xact_lock)이 실제로 prevHash 조회→insert 구간을 직렬화하는지
 * 직접 검증한다 — 100개를 동시에 Promise.all로 쏴서 경합을 최대화한다.
 *
 * ★ audit_log의 seq는 테이블 전역 순번이라, 다른 e2e 파일이 남긴 SYSTEM
 * 주체 이벤트(예: 재계산 SYSTEM 컨텍스트의 SCOPE_BYPASS)가 우연히 같은
 * 프로세스의 다음 파일 실행 중 끼어들 수 있다(다른 앱 인스턴스라도 큐 이름이
 * Redis에서 전역이라 이 파일이 새로 띄운 컨슈머가 주워 처리할 수 있음).
 * 그래서 "내가 쓴 100건끼리만" 연속인지가 아니라, AuditIntegrityVerifyService
 * 로 테이블 전체 체인이 분기 없이 이어지는지를 검증한다 — 이게 실제로
 * 완료조건이 요구하는 불변식이다(누가 썼든 체인은 하나여야 한다).
 */
describe('audit_log 해시 체인 동시성 (STEP8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auditLog: AuditLogService;
  let verifyService: AuditIntegrityVerifyService;
  let recalcQueue: Queue<RecalculationJobData>;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    auditLog = app.get(AuditLogService);
    verifyService = app.get(AuditIntegrityVerifyService);
    recalcQueue = app.get<Queue<RecalculationJobData>>(getQueueToken(RECALCULATION_QUEUE_NAME));
    notificationsQueue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
    // 이전 e2e 파일이 남겼을 수 있는 잔여 잡을 정리해 간섭을 최소화한다
    // (완전히 배제하지는 못하므로 아래 검증 자체를 간섭에 견고하게 설계했다).
    await recalcQueue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
  }, 60000);

  afterAll(async () => {
    await recalcQueue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  it('100건 동시 write()가 분기 없는 단일 해시 체인을 만든다', async () => {
    await Promise.all(
      Array.from({ length: CONCURRENT_WRITES }).map((_, i) =>
        auditLog.write({
          actorPrincipal: `concurrency-test-actor-${i}`,
          actorRole: 'ADMIN',
          eventType: 'CONCURRENCY_TEST',
          resourceType: 'ConcurrencyTest',
          afterValue: { i },
        }),
      ),
    );

    const myRows = await prisma.auditLog.findMany({ where: { eventType: 'CONCURRENCY_TEST' } });
    expect(myRows.length).toBe(CONCURRENT_WRITES);

    // 각 행의 record_hash가 저장된 필드로부터 재계산한 값과 일치하는지(내
    // 100건 각각의 정확성).
    for (const row of myRows) {
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
      expect(recomputed).toBe(row.recordHash);
    }

    // prevHash 값이 전부 서로 달라야 한다 — 분기했다면 두 행이 같은 prevHash를
    // 공유했을 것이다(null인 맨 첫 행 전체는 테이블에 하나만 있을 수 있다).
    const prevHashes = myRows.map((r) => r.prevHash).filter((h): h is string => h !== null);
    expect(new Set(prevHashes).size).toBe(prevHashes.length);

    // 테이블 전체 체인이(내 100건 + 혹시 끼어든 다른 이벤트까지 전부) 분기
    // 없이 이어지는지 — 이게 완료조건3이 실제로 요구하는 불변식이다.
    const now = new Date();
    const report = await verifyService.verify(new Date(now.getTime() - 60 * 60 * 1000), new Date(now.getTime() + 60 * 60 * 1000));
    expect(report.mismatches.filter((m) => m.type === 'CHAIN_BROKEN' || m.type === 'HASH_MISMATCH')).toEqual([]);
    expect(report.checkedCount).toBeGreaterThanOrEqual(CONCURRENT_WRITES);
  }, 60000);
});
