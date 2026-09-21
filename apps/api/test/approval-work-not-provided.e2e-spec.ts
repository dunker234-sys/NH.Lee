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
 * 완료조건2: "근로 미제공" 판정 시 사유 없이는 저장되지 않고, 감사로그에
 * 전/후 값이 남는다. + core-rules의 기존 제외 로직(daily-attendance.ts
 * 134-143)이 실제로 발동해 unapprovedOvertimeMinutes를 0으로 만드는지 확인.
 */
describe('근로 미제공 판정', () => {
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

  it('reason 없이는 400으로 거부된다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-wnp-reason');
    const res = await request(app.getHttpServer())
      .post('/admin/approval/work-not-provided-judgments')
      .set(auth(accessToken))
      .send({ employeeId: fixture.employees.plainEmployeeA.id, workDate: '2026-09-15' });
    expect(res.status).toBe(400);
  });

  it('정상 판정과 재판정 모두 감사로그에 전/후 값을 남긴다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-wnp-audit');
    const employeeId = fixture.employees.plainEmployeeA.id;
    const workDate = '2026-09-16';

    const firstRes = await request(app.getHttpServer())
      .post('/admin/approval/work-not-provided-judgments')
      .set(auth(accessToken))
      .send({ employeeId, workDate, reason: '무단결근 확인됨' });
    expect(firstRes.status).toBe(201);

    const firstAudit = await prisma.auditLog.findFirst({
      where: { eventType: 'WORK_NOT_PROVIDED_JUDGED', resourceId: firstRes.body.id },
      orderBy: { seq: 'desc' },
    });
    expect(firstAudit).not.toBeNull();
    expect(firstAudit!.beforeValue).toBeNull();
    expect((firstAudit!.afterValue as { reason: string }).reason).toBe('무단결근 확인됨');

    const secondRes = await request(app.getHttpServer())
      .post('/admin/approval/work-not-provided-judgments')
      .set(auth(accessToken))
      .send({ employeeId, workDate, reason: '정정: 사전 승인된 재택 대기' });
    expect(secondRes.status).toBe(201);

    const secondAudit = await prisma.auditLog.findFirst({
      where: { eventType: 'WORK_NOT_PROVIDED_JUDGED', resourceId: secondRes.body.id },
      orderBy: { seq: 'desc' },
    });
    expect((secondAudit!.beforeValue as { reason: string }).reason).toBe('무단결근 확인됨');
    expect((secondAudit!.afterValue as { reason: string }).reason).toBe('정정: 사전 승인된 재택 대기');
  });

  it('UNAPPROVED_ACTUAL 상태에 판정을 내리면 재계산 후 unapprovedOvertimeMinutes가 0이 된다', async () => {
    const employeeId = fixture.employees.regional.id;
    const workDate = '2026-09-17';

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
      return row?.status === 'UNAPPROVED_ACTUAL' && row.unapprovedOvertimeMinutes > 0;
    }, 8000);

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-wnp-recalc');
    const judgeRes = await request(app.getHttpServer())
      .post('/admin/approval/work-not-provided-judgments')
      .set(auth(accessToken))
      .send({ employeeId, workDate, reason: '연장 시간대 실근로 미제공 확인' });
    expect(judgeRes.status).toBe(201);

    await waitFor(async () => {
      const row = await prisma.attendanceDaily.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } } });
      return row.unapprovedOvertimeMinutes === 0;
    }, 8000);

    const finalRow = await prisma.attendanceDaily.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } } });
    expect(finalRow.unapprovedOvertimeMinutes).toBe(0);
  }, 15000);
});
