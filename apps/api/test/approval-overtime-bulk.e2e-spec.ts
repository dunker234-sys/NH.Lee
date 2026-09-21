import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from '../src/modules/recalculation/queue.constants';
import { RecalculationTriggerService } from '../src/modules/recalculation/recalculation-trigger.service';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from '../src/modules/notifications/queue.constants';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadNotificationPolicyConfigFixture } from './fixtures';

function kst(dateStr: string, hhmm: string): Date {
  return new Date(`${dateStr}T${hhmm}:00+09:00`);
}

function workDateOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`waitFor 타임아웃(${timeoutMs}ms) 초과`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * 완료조건1: 미승인 실적 → 사후 신청 → 일괄 승인 → 집계 전환이 통합
 * 테스트로 검증된다. OvertimeRequest를 전혀 만들지 않은 상태에서 시작해,
 * 일괄 승인 한 번으로 "사후 신청 생성"과 "승인"을 동시에 만족함을 증명한다.
 */
describe('연장근로 미승인 실적 → 사후 신청 → 일괄 승인 → 집계 전환', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let trigger: RecalculationTriggerService;
  let queue: Queue<RecalculationJobData>;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    trigger = app.get(RecalculationTriggerService);
    queue = app.get<Queue<RecalculationJobData>>(getQueueToken(RECALCULATION_QUEUE_NAME));
    notificationsQueue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
  }, 60000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  async function insertPunch(employeeId: string, workDate: string, type: 'IN' | 'OUT', hhmm: string) {
    return prisma.punchRaw.create({
      data: {
        employeeId,
        siteId: fixture.siteA.id,
        punchType: type,
        recordedAt: kst(workDate, hhmm),
        workDate: workDateOf(workDate),
        idempotencyKey: `${employeeId}-${type}-${workDate}-${hhmm}-${Math.random().toString(36).slice(2)}`,
        registrationMethod: 'PC',
        deviceId: 'e2e-test-device',
        integrityFlags: [],
      },
    });
  }

  it('사전 OvertimeRequest 없이도 일괄 승인 한 번으로 사후 신청+승인+집계 전환이 이뤄진다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const workDate = '2026-09-14';

    await prisma.schedule.create({
      data: {
        employeeId,
        siteId: fixture.siteA.id,
        workDate: workDateOf(workDate),
        plannedStartAt: kst(workDate, '08:00'),
        plannedEndAt: kst(workDate, '17:00'),
        plannedBreakMinutes: 60,
        status: 'CONFIRMED',
      },
    });
    await insertPunch(employeeId, workDate, 'IN', '08:00');
    await insertPunch(employeeId, workDate, 'OUT', '20:00');
    await trigger.onPunchSaved(employeeId, workDate);

    await waitFor(async () => {
      const row = await prisma.attendanceDaily.findUnique({
        where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } },
      });
      return row?.status === 'UNAPPROVED_ACTUAL';
    }, 8000);

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-overtime-bulk');

    const listRes = await request(app.getHttpServer())
      .get(`/admin/approval/overtime-requests/unapproved-actuals?siteId=${fixture.siteA.id}&from=${workDate}&to=${workDate}`)
      .set(auth(accessToken));
    expect(listRes.status).toBe(200);
    const row = listRes.body.find((r: { employeeId: string }) => r.employeeId === employeeId);
    expect(row).toBeDefined();
    expect(row.existingRequestId).toBeNull();
    expect(row.unapprovedOvertimeMinutes).toBeGreaterThan(0);

    const bulkRes = await request(app.getHttpServer())
      .post('/admin/approval/overtime-requests/bulk-approve')
      .set(auth(accessToken))
      .send({ items: [{ employeeId, targetDate: workDate }] });
    expect(bulkRes.status).toBe(201);
    expect(bulkRes.body.approvedCount).toBe(1);
    expect(bulkRes.body.skippedCount).toBe(0);

    const created = await prisma.overtimeRequest.findUniqueOrThrow({ where: { id: bulkRes.body.overtimeRequestIds[0] } });
    expect(created.requestType).toBe('POST');
    expect(created.status).toBe('APPROVED');
    expect(created.bulkApprovalBatchId).toBe(bulkRes.body.batchId);

    await waitFor(async () => {
      const daily = await prisma.attendanceDaily.findUniqueOrThrow({
        where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } },
      });
      return daily.status !== 'UNAPPROVED_ACTUAL';
    }, 8000);

    const daily = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } },
    });
    expect(daily.unapprovedOvertimeMinutes).toBe(0);
    expect(daily.approvedOvertimeMinutes).toBeGreaterThan(0);

    const auditRows = await prisma.auditLog.findMany({ where: { eventType: 'OVERTIME_BULK_APPROVED' }, orderBy: { seq: 'desc' } });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    const afterValue = auditRows[0].afterValue as { batchId: string; approvedCount: number };
    expect(afterValue.batchId).toBe(bulkRes.body.batchId);
    expect(afterValue.approvedCount).toBe(1);
  }, 20000);
});
