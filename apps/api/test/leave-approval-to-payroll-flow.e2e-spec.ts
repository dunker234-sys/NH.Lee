import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { NoShowDetectionTriggerService } from '../src/modules/no-show-detection/no-show-detection-trigger.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from '../src/modules/recalculation/queue.constants';
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

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 8000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`waitFor 타임아웃(${timeoutMs}ms) 초과`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * 완료조건5: 승인 → 근태 반영 → 급여 산출까지 흐름이 통합 테스트로
 * 검증된다. "급여 산출"은 STEP11(급여 마감, 미착수) 이전 단계인
 * AttendanceMonthly.totals까지를 뜻한다(§Context 근거) — recalculation.service.ts가
 * 이미 하는 집계를, 휴가 승인 흐름이 실제로 만들어내는지 증명한다.
 */
describe('휴가 승인 → 근태 반영 → 급여 산출(AttendanceMonthly) 흐름', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let noShowTrigger: NoShowDetectionTriggerService;
  let recalcQueue: Queue<RecalculationJobData>;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    noShowTrigger = app.get(NoShowDetectionTriggerService);
    recalcQueue = app.get<Queue<RecalculationJobData>>(getQueueToken(RECALCULATION_QUEUE_NAME));
    notificationsQueue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
  }, 60000);

  afterAll(async () => {
    await recalcQueue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  it('신청→승인이 잔액 차감, 근태 반영, 미등록 제외, 월간 집계까지 전부 만들어낸다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const workDate = '2026-09-14';
    const yearMonth = '2026-09';

    const leaveType = await prisma.leaveType.create({
      data: { code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' },
    });
    await prisma.leaveBalance.create({
      data: {
        employeeId,
        leaveTypeId: leaveType.id,
        referencePeriod: '2026-01-01',
        effectiveDate: workDateOf('2026-01-01'),
        expiryDate: workDateOf('2026-12-31'),
        grantedDays: 15,
        basis: { reasonCode: 'FULL_YEAR_GRANT' },
      },
    });
    await prisma.schedule.create({
      data: {
        employeeId,
        siteId: fixture.siteA.id,
        workDate: workDateOf(workDate),
        plannedStartAt: kst(workDate, '09:00'),
        plannedEndAt: kst(workDate, '18:00'),
        plannedBreakMinutes: 60,
        status: 'CONFIRMED',
      },
    });

    const { accessToken: employeeToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-leave-flow-emp');
    const createRes = await request(app.getHttpServer())
      .post('/me/leave-requests')
      .set(auth(employeeToken))
      .send({ leaveTypeId: leaveType.id, startDate: workDate, endDate: workDate, unit: 'FULL' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('PENDING');

    const { accessToken: managerToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-leave-flow-mgr');
    const approveRes = await request(app.getHttpServer())
      .post(`/admin/leave/requests/${createRes.body.id}/approve`)
      .set(auth(managerToken))
      .send({ expectedVersion: 1 });
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.status).toBe('APPROVED');

    const balanceAfter = await prisma.leaveBalance.findUniqueOrThrow({
      where: { employeeId_leaveTypeId_referencePeriod: { employeeId, leaveTypeId: leaveType.id, referencePeriod: '2026-01-01' } },
    });
    expect(balanceAfter.usedDays.toNumber()).toBe(1);

    await waitFor(async () => {
      const row = await prisma.attendanceDaily.findUnique({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } } });
      return row != null && row.paidLeaveMinutes > 0;
    });
    const dailyRow = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } },
    });
    expect(dailyRow.paidLeaveMinutes).toBeGreaterThan(0);

    await noShowTrigger.triggerForDate(workDate);
    const noShowTarget = await prisma.noShowNotificationTarget.findUnique({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } },
    });
    expect(noShowTarget).toBeNull();

    await waitFor(async () => {
      const monthly = await prisma.attendanceMonthly.findUnique({ where: { employeeId_yearMonth: { employeeId, yearMonth } } });
      if (!monthly) return false;
      const totals = monthly.totals as { paidLeaveMinutes: number };
      return totals.paidLeaveMinutes > 0;
    });
    const monthly = await prisma.attendanceMonthly.findUniqueOrThrow({ where: { employeeId_yearMonth: { employeeId, yearMonth } } });
    const totals = monthly.totals as { paidLeaveMinutes: number };
    expect(totals.paidLeaveMinutes).toBeGreaterThan(0);

    const auditRow = await prisma.auditLog.findFirst({
      where: { eventType: 'LEAVE_REQUEST_APPROVED', resourceId: createRes.body.id },
      orderBy: { seq: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    expect((auditRow!.beforeValue as { status: string }).status).toBe('PENDING');
    expect((auditRow!.afterValue as { status: string }).status).toBe('APPROVED');
  }, 20000);
});
