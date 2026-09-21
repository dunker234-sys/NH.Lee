import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from '../src/modules/recalculation/queue.constants';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from '../src/modules/notifications/queue.constants';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadNotificationPolicyConfigFixture } from './fixtures';

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

/** 요구사항서4.3 §3(반려 시 사유 필수), §6(취소 — 사용 전 자동 복원 / 사후 승인 필요). */
describe('휴가 신청 생명주기 — 반려/취소', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let leaveTypeId: string;
  let recalcQueue: Queue<RecalculationJobData>;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    recalcQueue = app.get<Queue<RecalculationJobData>>(getQueueToken(RECALCULATION_QUEUE_NAME));
    notificationsQueue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
    const leaveType = await prisma.leaveType.create({
      data: { code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' },
    });
    leaveTypeId = leaveType.id;
  }, 60000);

  afterAll(async () => {
    await recalcQueue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  async function createBalance(employeeId: string, referencePeriod: string) {
    return prisma.leaveBalance.create({
      data: {
        employeeId,
        leaveTypeId,
        referencePeriod,
        effectiveDate: workDateOf('2026-01-01'),
        expiryDate: workDateOf('2026-12-31'),
        grantedDays: 15,
        basis: { reasonCode: 'FULL_YEAR_GRANT' },
      },
    });
  }

  it('사유 없이 반려하면 400으로 거부된다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    await createBalance(employeeId, '2026-lifecycle-reject');
    const { accessToken: empToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-lifecycle-reject-emp');
    const createRes = await request(app.getHttpServer())
      .post('/me/leave-requests')
      .set(auth(empToken))
      .send({ leaveTypeId, startDate: '2026-10-05', endDate: '2026-10-05', unit: 'FULL' });
    expect(createRes.status).toBe(201);

    const { accessToken: mgrToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-lifecycle-reject-mgr');
    const rejectRes = await request(app.getHttpServer())
      .post(`/admin/leave/requests/${createRes.body.id}/reject`)
      .set(auth(mgrToken))
      .send({ expectedVersion: 1 });
    expect(rejectRes.status).toBe(400);
  });

  it('사유와 함께 반려하면 잔액은 그대로고 신청은 REJECTED가 된다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    await createBalance(employeeId, '2026-lifecycle-reject-2');
    const { accessToken: empToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-lifecycle-reject2-emp');
    const createRes = await request(app.getHttpServer())
      .post('/me/leave-requests')
      .set(auth(empToken))
      .send({ leaveTypeId, startDate: '2026-10-06', endDate: '2026-10-06', unit: 'FULL' });

    const { accessToken: mgrToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-lifecycle-reject2-mgr');
    const rejectRes = await request(app.getHttpServer())
      .post(`/admin/leave/requests/${createRes.body.id}/reject`)
      .set(auth(mgrToken))
      .send({ expectedVersion: 1, reason: '해당 기간 인력 부족' });
    expect(rejectRes.status).toBe(201);
    expect(rejectRes.body.status).toBe('REJECTED');

    const balance = await prisma.leaveBalance.findUniqueOrThrow({
      where: { employeeId_leaveTypeId_referencePeriod: { employeeId, leaveTypeId, referencePeriod: '2026-lifecycle-reject-2' } },
    });
    expect(balance.usedDays.toNumber()).toBe(0);
  });

  it('사용 예정일 이전에 취소하면 자동으로 잔액이 복원되고 근태에서도 제외된다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const workDate = '2026-11-10';
    await createBalance(employeeId, '2026-lifecycle-cancel');
    await prisma.schedule.create({
      data: {
        employeeId,
        siteId: fixture.siteA.id,
        workDate: workDateOf(workDate),
        plannedStartAt: new Date(`${workDate}T09:00:00+09:00`),
        plannedEndAt: new Date(`${workDate}T18:00:00+09:00`),
        plannedBreakMinutes: 60,
        status: 'CONFIRMED',
      },
    });

    const { accessToken: empToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-lifecycle-cancel-emp');
    const createRes = await request(app.getHttpServer())
      .post('/me/leave-requests')
      .set(auth(empToken))
      .send({ leaveTypeId, startDate: workDate, endDate: workDate, unit: 'FULL' });

    const { accessToken: mgrToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-lifecycle-cancel-mgr');
    const approveRes = await request(app.getHttpServer())
      .post(`/admin/leave/requests/${createRes.body.id}/approve`)
      .set(auth(mgrToken))
      .send({ expectedVersion: 1 });
    expect(approveRes.status).toBe(201);

    await waitFor(async () => {
      const row = await prisma.attendanceDaily.findUnique({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } } });
      return row != null && row.paidLeaveMinutes > 0;
    });

    const cancelRes = await request(app.getHttpServer()).post(`/me/leave-requests/${createRes.body.id}/cancel`).set(auth(empToken));
    expect(cancelRes.status).toBe(201);
    expect(cancelRes.body.status).toBe('CANCELLED');

    const balance = await prisma.leaveBalance.findUniqueOrThrow({
      where: { employeeId_leaveTypeId_referencePeriod: { employeeId, leaveTypeId, referencePeriod: '2026-lifecycle-cancel' } },
    });
    expect(balance.usedDays.toNumber()).toBe(0);

    await waitFor(async () => {
      const row = await prisma.attendanceDaily.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } } });
      return row.paidLeaveMinutes === 0;
    });
  }, 20000);

  it('사용 개시일 이후 취소는 즉시 반영되지 않고 관리자 승인이 필요하다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    await createBalance(employeeId, '2026-lifecycle-postcancel');
    // 과거 날짜(=이미 개시)로 신청하려면 관리자 직접 생성이 필요하므로 DB에
    // 바로 APPROVED 상태의 과거 휴가를 만든다(사후 취소 시나리오 세팅).
    const past = '2020-01-02';
    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId,
        startDate: workDateOf(past),
        endDate: workDateOf(past),
        unit: 'FULL',
        status: 'APPROVED',
        deductedDays: 1,
      },
    });

    const { accessToken: empToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-lifecycle-postcancel-emp');
    const cancelRes = await request(app.getHttpServer()).post(`/me/leave-requests/${leaveRequest.id}/cancel`).set(auth(empToken));
    expect(cancelRes.status).toBe(201);
    expect(cancelRes.body.status).toBe('CANCEL_PENDING');

    const { accessToken: mgrToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-lifecycle-postcancel-mgr');
    const approveCancelRes = await request(app.getHttpServer())
      .post(`/admin/leave/requests/${leaveRequest.id}/approve-cancellation`)
      .set(auth(mgrToken));
    expect(approveCancelRes.status).toBe(201);
    expect(approveCancelRes.body.status).toBe('CANCELLED');
  });
});
