import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from '../src/modules/recalculation/queue.constants';
import { RecalculationTriggerService } from '../src/modules/recalculation/recalculation-trigger.service';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from '../src/modules/notifications/queue.constants';
import { PayrollCloseGuardService } from '../src/modules/approval/payroll-close-guard.service';
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
 * 완료조건4: 미승인 실적이 남아 있으면 STEP11의 마감이 차단된다.
 * STEP11(마감 기능) 자체는 아직 없으므로, PayrollCloseGuardService를
 * 직접 주입해 호출하고(향후 STEP11이 그대로 재사용할 게이트) + 읽기
 * 전용 준비상태 엔드포인트로 blocked:true→false 전환을 증명한다.
 */
describe('마감 차단 가드 — 미승인 실적 존재 여부', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let trigger: RecalculationTriggerService;
  let guard: PayrollCloseGuardService;
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
    guard = app.get(PayrollCloseGuardService);
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

  it('미승인 실적이 있으면 blocked, 일괄 승인으로 해소하면 blocked가 풀린다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const workDate = '2026-09-28';
    const yearMonth = '2026-09';

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
      const row = await prisma.attendanceDaily.findUnique({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } } });
      return row?.status === 'UNAPPROVED_ACTUAL';
    }, 8000);

    expect(await guard.hasUnresolvedUnapprovedActuals(fixture.siteA.id, yearMonth)).toBe(true);

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-close-guard');
    const readinessBefore = await request(app.getHttpServer())
      .get(`/admin/approval/payroll-close/readiness?siteId=${fixture.siteA.id}&yearMonth=${yearMonth}`)
      .set(auth(accessToken));
    expect(readinessBefore.status).toBe(200);
    expect(readinessBefore.body.blocked).toBe(true);
    expect(readinessBefore.body.unresolvedCount).toBeGreaterThan(0);

    const bulkRes = await request(app.getHttpServer())
      .post('/admin/approval/overtime-requests/bulk-approve')
      .set(auth(accessToken))
      .send({ items: [{ employeeId, targetDate: workDate }] });
    expect(bulkRes.status).toBe(201);

    await waitFor(async () => {
      const row = await prisma.attendanceDaily.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } } });
      return row.status !== 'UNAPPROVED_ACTUAL';
    }, 8000);

    expect(await guard.hasUnresolvedUnapprovedActuals(fixture.siteA.id, yearMonth)).toBe(false);

    const readinessAfter = await request(app.getHttpServer())
      .get(`/admin/approval/payroll-close/readiness?siteId=${fixture.siteA.id}&yearMonth=${yearMonth}`)
      .set(auth(accessToken));
    expect(readinessAfter.body.blocked).toBe(false);
    expect(readinessAfter.body.unresolvedCount).toBe(0);
  }, 20000);
});
