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

function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 완료조건1: 1년 기간제(정확히 365일 근무 후 종료) 근로자 연차가 11일로
 * 계산된다(15일이 아님) — 대법원 2021.10.14. 2021다227100.
 */
describe('연차 자동 계산 — 1년 기간제 11일 상한(대법 2021다227100)', () => {
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

  async function createSchedule(employeeId: string, workDate: string, hh1: string, hh2: string) {
    return prisma.schedule.create({
      data: {
        employeeId,
        siteId: fixture.siteA.id,
        workDate: workDateOf(workDate),
        plannedStartAt: kst(workDate, hh1),
        plannedEndAt: kst(workDate, hh2),
        plannedBreakMinutes: 60,
        status: 'CONFIRMED',
      },
    });
  }

  it('11개월 개근한 1년 기간제(365일) 근로자는 연차 11일 — 15일은 발생하지 않는다', async () => {
    const hireDate = '2025-09-01';
    const resignationDate = '2026-08-31'; // 정확히 1년(365일) 계약
    const employee = await prisma.employee.create({
      data: {
        employeeNo: 'T-FIXEDTERM-1',
        name: '테스트-1년기간제',
        employmentType: 'CONTRACT',
        hireDate: workDateOf(hireDate),
        resignationDate: workDateOf(resignationDate),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });
    await prisma.employeeSiteAssignment.create({
      data: { employeeId: employee.id, siteId: fixture.siteA.id, assignmentRole: 'PRIMARY', startDate: workDateOf(hireDate) },
    });

    // 11개월(월별 1일씩 스케줄) — buildMonthlyAttendanceRecords가 각 달에
    // 최소 1건의 Schedule이 있어야 "그 달에 소정근로일이 있다"로 본다.
    for (let i = 0; i < 11; i += 1) {
      await createSchedule(employee.id, addMonths(hireDate, i), '09:00', '18:00');
    }
    // 마지막 4주(초단시간 게이트 통과용) — 위 11개월 평가 창(~2026-07-31까지)
    // 밖의 날짜라 "11개월 개근" 판정에는 영향을 주지 않는다.
    for (let d = 0; d < 20; d += 1) {
      await createSchedule(employee.id, addDaysStr('2026-08-04', d), '09:00', '18:00');
    }

    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-leave-fixedterm');
    const typeRes = await request(app.getHttpServer())
      .post('/admin/leave/types')
      .set(auth(accessToken))
      .send({ code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' });
    expect(typeRes.status).toBe(201);

    const runRes = await request(app.getHttpServer())
      .post('/admin/leave/accrual/run')
      .set(auth(accessToken))
      .send({ asOfDate: resignationDate, siteId: fixture.siteA.id });
    expect(runRes.status).toBe(201);
    expect(runRes.body.employeeIds).toContain(employee.id);

    const balances = await prisma.leaveBalance.findMany({ where: { employeeId: employee.id } });
    expect(balances).toHaveLength(1);
    const balance = balances[0];
    expect(balance.grantedDays.toNumber()).toBe(11);
    expect(balance.grantedDays.toNumber()).not.toBe(15);
    const basis = balance.basis as { reasonCode: string };
    expect(basis.reasonCode).toBe('MONTHLY_ACCRUAL');
  }, 30000);
});
