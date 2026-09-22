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
import { Fixture, loadFixture, loadPolicyConfigFixture, loadLeavePolicyConfigFixture } from './fixtures';

function kst(dateStr: string, hhmm: string): Date {
  return new Date(`${dateStr}T${hhmm}:00+09:00`);
}

function workDateOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 완료조건2: 육아휴직 3개월이 있는 근로자의 출근율이 결근으로 계산되지
 * 않는다(§60⑥ 출근간주 기간).
 */
describe('연차 자동 계산 — §60⑥ 출근간주 기간(육아휴직)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let recalcQueue: Queue<RecalculationJobData>;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadLeavePolicyConfigFixture();
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

  async function createSchedule(employeeId: string, workDate: string) {
    return prisma.schedule.create({
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
  }

  async function createAbsentDay(employeeId: string, siteId: string, workDate: string) {
    return prisma.attendanceDaily.create({
      data: {
        employeeId,
        siteId,
        workDate: workDateOf(workDate),
        isAbsence: true,
        status: 'NORMAL',
        inputSnapshotHash: `test-${employeeId}-${workDate}`,
        breakdown: [],
      },
    });
  }

  it('육아휴직 3개월(90일) 안의 결근일 20건이 결근으로 산정되지 않아 15일이 그대로 발생한다', async () => {
    const hireDate = '2024-01-01';
    const asOfDate = '2026-01-01'; // 2년차 완료 시점(§60① 경로)
    const periodStart = '2025-01-01';

    const employee = await prisma.employee.create({
      data: {
        employeeNo: 'T-CHILDCARE-1',
        name: '테스트-육아휴직',
        employmentType: 'REGULAR',
        hireDate: workDateOf(hireDate),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });
    await prisma.employeeSiteAssignment.create({
      data: { employeeId: employee.id, siteId: fixture.siteA.id, assignmentRole: 'PRIMARY', startDate: workDateOf(hireDate) },
    });

    // 소정근로일 40건(연중 분산) — totalScheduledWorkdays 확보.
    for (let i = 0; i < 40; i += 1) {
      await createSchedule(employee.id, addDaysStr(periodStart, i * 9));
    }
    // 마지막 4주(초단시간 게이트 통과용) — 20일 연속.
    for (let i = 0; i < 20; i += 1) {
      await createSchedule(employee.id, addDaysStr(asOfDate, -1 - i));
    }

    // 육아휴직: 2025-04-01 ~ 2025-06-30(약 91일).
    const { accessToken: adminToken } = await login(app, fixture.employees.admin.employeeNo, fixture.password, 'dev-childcare-admin');
    const statusRes = await request(app.getHttpServer())
      .post(`/employees/${employee.id}/protected-status`)
      .set(auth(adminToken))
      .send({ statusType: 'CHILDCARE_LEAVE', effectiveStartDate: '2025-04-01', effectiveEndDate: '2025-06-30' });
    expect(statusRes.status).toBe(201);

    // 육아휴직 기간 안의 20일을 "결근"으로 기록 — 출근간주가 없다면
    // 40일 중 20일 결근 = 50% 출근율로 80% 미달, 15일이 나오지 않아야 정상.
    for (let i = 0; i < 20; i += 1) {
      await createAbsentDay(employee.id, fixture.siteA.id, addDaysStr('2025-04-01', i));
    }

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-childcare-mgr');
    const typeRes = await request(app.getHttpServer())
      .post('/admin/leave/types')
      .set(auth(adminToken))
      .send({ code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' });
    expect(typeRes.status).toBe(201);

    const runRes = await request(app.getHttpServer())
      .post('/admin/leave/accrual/run')
      .set(auth(accessToken))
      .send({ asOfDate, siteId: fixture.siteA.id });
    expect(runRes.status).toBe(201);

    const balance = await prisma.leaveBalance.findFirstOrThrow({
      where: { employeeId: employee.id },
      orderBy: { effectiveDate: 'desc' },
    });
    expect(balance.grantedDays.toNumber()).toBe(15);

    const basis = balance.basis as { reasonCode: string; fullYearResult?: { attendanceRatePercent: number; meetsThreshold: boolean } };
    expect(basis.reasonCode).toBe('FULL_YEAR_GRANT');
    expect(basis.fullYearResult?.meetsThreshold).toBe(true);
    expect(basis.fullYearResult?.attendanceRatePercent).toBeGreaterThanOrEqual(80);
  }, 30000);
});
