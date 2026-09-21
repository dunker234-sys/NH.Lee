import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PunchLocationRetentionService } from '../src/modules/retention/punch-location-retention.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { Fixture, loadFixture } from './fixtures';

function workDateOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * STEP12 완료조건: 위치정보 파기 배치가 정상 실행되고 punch_raw는 그대로
 * 남는다. punch_location에만 DELETE가 수행됨을 직접 확인하고, 파기 사실
 * (건수·사유·실행자)이 audit_log에 남으며, 삭제 직전 확인자료(제16조②)가
 * location_access_log에 기록됨을 함께 검증한다.
 */
describe('위치정보 파기 배치 (STEP12)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let retentionService: PunchLocationRetentionService;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    retentionService = app.get(PunchLocationRetentionService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  async function createPunchWithLocation(employeeId: string, idempotencyKey: string, purgeScheduledAt: Date) {
    const punch = await prisma.punchRaw.create({
      data: {
        employeeId,
        siteId: fixture.siteA.id,
        punchType: 'IN',
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
        workDate: workDateOf('2026-01-01'),
        idempotencyKey,
        verificationLevel: 'NORMAL',
        registrationMethod: 'GPS',
        deviceId: 'dev-retention-test',
      },
    });
    const location = await prisma.punchLocation.create({
      data: { punchId: punch.id, lat: 37.5665, lng: 126.978, accuracyM: 10, purgeScheduledAt },
    });
    return { punch, location };
  }

  it('보존기간이 지난 위치정보만 삭제하고, punch_raw는 그대로 남으며, audit_log·location_access_log에 기록된다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const due = await createPunchWithLocation(employeeId, 'retention-due-1', new Date('2020-01-01T00:00:00.000Z'));
    const notYetDue = await createPunchWithLocation(employeeId, 'retention-not-due-1', new Date('2099-01-01T00:00:00.000Z'));

    const auditCountBefore = await prisma.auditLog.count({ where: { eventType: 'PUNCH_LOCATION_PURGED' } });

    const result = await retentionService.purgeDue();

    expect(result.purgedCount).toBe(1);

    // punch_location: 보존기간 지난 것만 삭제, 안 지난 것은 남는다.
    const dueLocation = await prisma.punchLocation.findUnique({ where: { punchId: due.punch.id } });
    expect(dueLocation).toBeNull();
    const notYetDueLocation = await prisma.punchLocation.findUnique({ where: { punchId: notYetDue.punch.id } });
    expect(notYetDueLocation).not.toBeNull();

    // punch_raw: 완전 불변 — 두 건 모두 그대로 남는다.
    const dueRaw = await prisma.punchRaw.findUnique({ where: { id: due.punch.id } });
    expect(dueRaw).not.toBeNull();
    expect(dueRaw?.idempotencyKey).toBe('retention-due-1');
    const notYetDueRaw = await prisma.punchRaw.findUnique({ where: { id: notYetDue.punch.id } });
    expect(notYetDueRaw).not.toBeNull();

    // audit_log: 파기 사실(건수·사유·실행자) 1건이 새로 생겼다.
    const auditCountAfter = await prisma.auditLog.count({ where: { eventType: 'PUNCH_LOCATION_PURGED' } });
    expect(auditCountAfter).toBe(auditCountBefore + 1);
    const auditRows = await prisma.auditLog.findMany({
      where: { eventType: 'PUNCH_LOCATION_PURGED' },
      orderBy: { seq: 'desc' },
      take: 1,
    });
    const latestAudit = auditRows[0];
    expect(latestAudit.actorPrincipal).toBe('SYSTEM');
    expect(latestAudit.jobId).toBeTruthy();
    const afterValue = latestAudit.afterValue as { purgedCount: number; reason: string };
    expect(afterValue.purgedCount).toBe(1);
    expect(afterValue.reason).toBe('SCHEDULED_SWEEP');

    // location_access_log: 삭제 직전 확인자료(제16조②) 1건.
    const accessLogRows = await prisma.locationAccessLog.findMany({ where: { employeeId } });
    expect(accessLogRows.some((r) => r.accessPurpose.includes('SCHEDULED_SWEEP'))).toBe(true);
  });

  it('철회(§24④) 시 보존기간과 무관하게 해당 직원분만 즉시 파기된다', async () => {
    const employeeId = fixture.employees.siteManagerB.id;
    const { punch } = await createPunchWithLocation(employeeId, `retention-withdraw-${Date.now()}`, new Date('2099-01-01T00:00:00.000Z'));

    const result = await retentionService.purgeForEmployee(employeeId);
    expect(result.purgedCount).toBe(1);

    const deletedLocation = await prisma.punchLocation.findUnique({ where: { punchId: punch.id } });
    expect(deletedLocation).toBeNull();
    const rawStillExists = await prisma.punchRaw.findUnique({ where: { id: punch.id } });
    expect(rawStillExists).not.toBeNull();
  });
});
