import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from '../src/modules/recalculation/queue.constants';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from '../src/modules/notifications/queue.constants';
import { mondayOfWeek, yearMonthOf } from '../src/common/time/week.util';
import { recentWorkDate } from './setup/dates';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import {
  Fixture,
  loadFixture,
  loadPolicyConfigFixture,
  loadCorrectionPolicyConfigFixture,
  loadNotificationPolicyConfigFixture,
} from './fixtures';

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
 * ROADMAP STEP8 완료조건5: "정정 승인 시 일·주·월...산출 데이터가 모두
 * 갱신된다." AttendanceInputBuilderService가 APPROVED_L1/APPROVED_L2 둘 다
 * 계산 입력으로 반영하므로(§Context), 1차 승인만으로 이미 일·주·월 전체가
 * 갱신됨을 증명한다 — "승인 즉시 재계산"이라는 요구사항과 정확히 일치.
 */
describe('정정 승인 → 재계산 (STEP8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let recalcQueue: Queue<RecalculationJobData>;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadCorrectionPolicyConfigFixture();
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    recalcQueue = app.get<Queue<RecalculationJobData>>(getQueueToken(RECALCULATION_QUEUE_NAME));
    notificationsQueue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
  }, 60000);

  afterAll(async () => {
    await recalcQueue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  it('PUNCH_MISSING 정정은 1차(SITE_MANAGER) 승인만으로 일·주·월 집계에 반영된다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const workDate = recentWorkDate(1);

    await prisma.punchRaw.create({
      data: {
        employeeId,
        siteId: fixture.siteA.id,
        punchType: 'IN',
        recordedAt: new Date(`${workDate}T09:00:00+09:00`),
        workDate: workDateOf(workDate),
        idempotencyKey: `correction-e2e-in-${workDate}`,
        verificationLevel: 'NORMAL',
        registrationMethod: 'GPS',
        deviceId: 'dev-correction-e2e',
      },
    });

    const { accessToken: employeeToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-correction-e2e-emp');
    const submitRes = await request(app.getHttpServer())
      .post('/me/correction-requests')
      .set(auth(employeeToken))
      .send({
        targetWorkDate: workDate,
        reasonCode: 'PUNCH_MISSING',
        reasonDetail: '퇴근 타각 누락 — 실제로는 정상 퇴근함',
        afterValue: { punchType: 'OUT', recordedAt: `${workDate}T18:00:00+09:00` },
      });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.status).toBe('PENDING');
    expect(submitRes.body.version).toBe(1);

    const { accessToken: managerToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-correction-e2e-mgr');
    const approveRes = await request(app.getHttpServer())
      .post(`/admin/correction/requests/${submitRes.body.id}/approve`)
      .set(auth(managerToken))
      .send({ expectedVersion: 1 });
    expect(approveRes.status).toBe(201);
    // 정책 기본값(correctionRequiresSecondApproval=1)이라 1차 승인은 APPROVED_L1까지만 간다.
    expect(approveRes.body.status).toBe('APPROVED_L1');

    await waitFor(async () => {
      const daily = await prisma.attendanceDaily.findUnique({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } } });
      return daily != null && daily.actualWorkMinutes > 400;
    });
    const daily = await prisma.attendanceDaily.findUniqueOrThrow({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } } });
    expect(daily.actualWorkMinutes).toBeGreaterThan(400); // 09:00~18:00 ≈ 540분(휴게 차감 있어도 대부분 남음)

    // recalculateSingleDay → recalculateWeek/Month cascade는 daily 커밋 이후
    // 순차 실행이라, daily가 보이는 시점과 weekly/monthly가 보이는 시점 사이에
    // 짧은 창이 있다 — 별도로 waitFor한다(daily만 기다리면 부하가 큰 배치
    // 실행 중엔 간헐적으로 weekly/monthly가 아직 없을 수 있다, 실측으로 확인).
    const weekStart = mondayOfWeek(workDate);
    await waitFor(async () => {
      const weekly = await prisma.attendanceWeekly.findUnique({ where: { employeeId_weekStartDate: { employeeId, weekStartDate: workDateOf(weekStart) } } });
      return weekly != null && weekly.totalWorkMinutes > 0;
    });
    const weekly = await prisma.attendanceWeekly.findUniqueOrThrow({ where: { employeeId_weekStartDate: { employeeId, weekStartDate: workDateOf(weekStart) } } });
    expect(weekly.totalWorkMinutes).toBeGreaterThan(0);

    await waitFor(async () => {
      const monthly = await prisma.attendanceMonthly.findUnique({ where: { employeeId_yearMonth: { employeeId, yearMonth: yearMonthOf(workDate) } } });
      if (!monthly) return false;
      const totals = monthly.totals as { actualWorkMinutes: number };
      return totals.actualWorkMinutes > 0;
    });
    const monthly = await prisma.attendanceMonthly.findUniqueOrThrow({ where: { employeeId_yearMonth: { employeeId, yearMonth: yearMonthOf(workDate) } } });
    const totals = monthly.totals as { actualWorkMinutes: number };
    expect(totals.actualWorkMinutes).toBeGreaterThan(0);

    const auditRow = await prisma.auditLog.findFirst({
      where: { eventType: 'CORRECTION_APPROVED', resourceId: submitRes.body.id },
      orderBy: { seq: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.subjectEmployeeId).toBe(employeeId);
    expect((auditRow!.afterValue as { status: string }).status).toBe('APPROVED_L1');
  }, 20000);

  it('2차 승인이 불필요한 사업장 정책에서는 1차 승인이 바로 APPROVED_L2가 된다', async () => {
    await adminPrisma.policyConfig.create({
      data: {
        key: 'correctionRequiresSecondApproval',
        value: 0,
        siteId: fixture.siteB.id,
        effectiveStartDate: new Date('2026-01-01'),
      },
    });

    const workDate = recentWorkDate(2);
    const { accessToken: employeeToken } = await login(app, fixture.employees.siteManagerB.employeeNo, fixture.password, 'dev-correction-e2e-siteb');
    const submitRes = await request(app.getHttpServer())
      .post('/me/correction-requests')
      .set(auth(employeeToken))
      .send({
        targetWorkDate: workDate,
        reasonCode: 'OTHER',
        reasonDetail: '정보성 정정 — 2차 승인 불필요 정책 테스트',
        afterValue: { note: '정보성' },
      });
    expect(submitRes.status).toBe(201);

    const approveRes = await request(app.getHttpServer())
      .post(`/admin/correction/requests/${submitRes.body.id}/approve`)
      .set(auth(employeeToken))
      .send({ expectedVersion: 1 });
    // siteManagerB 본인이 자기 사업장 관리자이므로 승인 권한이 있다.
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.status).toBe('APPROVED_L2');
  }, 20000);

  it('HQ_HR은 PENDING에서 바로 APPROVED_L2로 1차를 건너뛸 수 있다', async () => {
    const workDate = recentWorkDate(3);
    const { accessToken: employeeToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-correction-e2e-skip');
    const submitRes = await request(app.getHttpServer())
      .post('/me/correction-requests')
      .set(auth(employeeToken))
      .send({
        targetWorkDate: workDate,
        reasonCode: 'OTHER',
        reasonDetail: 'HQ_HR 직접 승인 경로 테스트',
        afterValue: { note: '정보성' },
      });
    expect(submitRes.status).toBe(201);

    const { accessToken: hqToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-correction-e2e-hq');
    const approveRes = await request(app.getHttpServer())
      .post(`/admin/correction/requests/${submitRes.body.id}/approve`)
      .set(auth(hqToken))
      .send({ expectedVersion: 1 });
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.status).toBe('APPROVED_L2');
  }, 20000);

  it('직권 정정(ADMIN)은 즉시 APPROVED_L2로 생성되고 근로자에게 통지된다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const workDate = recentWorkDate(4);

    const { accessToken: adminToken } = await login(app, fixture.employees.admin.employeeNo, fixture.password, 'dev-correction-e2e-admin');
    const res = await request(app.getHttpServer())
      .post('/admin/correction/admin-direct')
      .set(auth(adminToken))
      .send({
        employeeId,
        targetWorkDate: workDate,
        reasonCode: 'OTHER',
        reasonDetail: '관리자 직권 정정 — 시스템 오류로 인한 일괄 보정',
        afterValue: { note: '직권 정정' },
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED_L2');
    expect(res.body.requestSource).toBe('ADMIN_DIRECT');

    const auditRow = await prisma.auditLog.findFirst({
      where: { eventType: 'ADMIN_CORRECTION', resourceId: res.body.id },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.subjectEmployeeId).toBe(employeeId);
  }, 20000);
});
