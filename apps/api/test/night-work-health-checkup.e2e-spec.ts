import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import {
  Fixture,
  loadFixture,
  loadNightWorkHealthCheckupPolicyConfigFixture,
  loadNotificationPolicyConfigFixture,
} from './fixtures';

function dayAfterEpoch(epoch: string, n: number): string {
  const d = new Date(`${epoch}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function kst(dateStr: string, hhmm: string): Date {
  return new Date(`${dateStr}T${hhmm}:00+09:00`);
}

/**
 * 요구사항서 4.4④ 야간작업 특수건강진단 대상자 판정(산안법 §130, 시행규칙
 * 별표22 제4호). ① 6개월간 00:00~05:00 포함 연속 8h 작업이 24회 이상이면
 * 대상이라는 core-rules 계산을 실제 Postgres 타각으로부터 재현해 확인한다.
 */
describe('NightWorkHealthCheckup — 요구사항서 4.4④ 야간작업 특수건강진단', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadNightWorkHealthCheckupPolicyConfigFixture();
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('①: 00:00~05:00 포함 연속 8h 야간 세션 24회 이상이면 대상자로 판정되고 사업장관리자·HQ_HR에게 통지된다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'nwhc-test');

    const target = await prisma.employee.create({
      data: {
        employeeNo: 'T-NIGHT-TARGET',
        name: '야간근무자',
        employmentType: 'REGULAR',
        hireDate: new Date('2024-01-01'),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });

    const epoch = '2026-03-01';
    // 24세션이 epoch~epoch+46일에 걸쳐 있다 — asOfDate를 그로부터 60일 뒤로
    // 잡으면 첫 세션(epoch)도 6개월(약 183일) 창 안에 넉넉히 들어오고,
    // 마지막 세션도 이미 지난 날짜가 된다.
    const asOfDate = dayAfterEpoch(epoch, 60);

    for (let i = 0; i < 24; i += 1) {
      const day = dayAfterEpoch(epoch, i * 2);
      const nextDay = dayAfterEpoch(epoch, i * 2 + 1);
      await prisma.punchRaw.create({
        data: {
          employeeId: target.id,
          siteId: fixture.siteA.id,
          punchType: 'IN',
          recordedAt: kst(day, '22:00'),
          workDate: new Date(`${day}T00:00:00.000Z`),
          idempotencyKey: `nwhc-${target.id}-IN-${day}`,
          registrationMethod: 'PC',
          deviceId: 'nwhc-test-device',
          integrityFlags: [],
        },
      });
      await prisma.punchRaw.create({
        data: {
          employeeId: target.id,
          siteId: fixture.siteA.id,
          punchType: 'OUT',
          recordedAt: kst(nextDay, '06:00'),
          workDate: new Date(`${day}T00:00:00.000Z`),
          idempotencyKey: `nwhc-${target.id}-OUT-${day}`,
          registrationMethod: 'PC',
          deviceId: 'nwhc-test-device',
          integrityFlags: [],
        },
      });
    }

    const recalcRes = await request(app.getHttpServer())
      .post('/admin/compliance-reports/night-work-health-checkup/recalculate')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ siteId: fixture.siteA.id, asOfDate });
    expect(recalcRes.status).toBe(201);
    expect(recalcRes.body.newlyEligibleCount).toBeGreaterThanOrEqual(1);

    const status = await prisma.nightWorkHealthCheckupStatus.findUnique({ where: { employeeId: target.id } });
    expect(status?.eligible).toBe(true);
    expect(status?.criterion1Met).toBe(true);
    expect(status?.criterion1Count).toBe(24);

    const listRes = await request(app.getHttpServer())
      .get('/admin/compliance-reports/night-work-health-checkup')
      .query({ siteId: fixture.siteA.id })
      .set({ Authorization: `Bearer ${accessToken}` });
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((r: { employeeId: string }) => r.employeeId === target.id)).toBe(true);

    const siteManagerAlerts = await prisma.alertLog.findMany({
      where: { recipientEmployeeId: fixture.employees.siteManagerA.id, notificationType: 'NIGHT_WORK_HEALTH_CHECKUP_TARGET' },
    });
    const hqHrAlerts = await prisma.alertLog.findMany({
      where: { recipientEmployeeId: fixture.employees.hqHr.id, notificationType: 'NIGHT_WORK_HEALTH_CHECKUP_TARGET' },
    });
    expect(siteManagerAlerts.length).toBeGreaterThan(0);
    expect(hqHrAlerts.length).toBeGreaterThan(0);
  }, 60000);

  it('②를 충족하지 못하고 ①도 충족하지 못하는 일반 주간 근무자는 대상이 아니다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'nwhc-test-2');

    const dayWorker = await prisma.employee.create({
      data: {
        employeeNo: 'T-DAY-WORKER',
        name: '주간근무자',
        employmentType: 'REGULAR',
        hireDate: new Date('2024-01-01'),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });

    const day = '2026-09-01';
    await prisma.punchRaw.create({
      data: {
        employeeId: dayWorker.id,
        siteId: fixture.siteA.id,
        punchType: 'IN',
        recordedAt: kst(day, '09:00'),
        workDate: new Date(`${day}T00:00:00.000Z`),
        idempotencyKey: `nwhc-${dayWorker.id}-IN`,
        registrationMethod: 'PC',
        deviceId: 'nwhc-test-device',
        integrityFlags: [],
      },
    });
    await prisma.punchRaw.create({
      data: {
        employeeId: dayWorker.id,
        siteId: fixture.siteA.id,
        punchType: 'OUT',
        recordedAt: kst(day, '18:00'),
        workDate: new Date(`${day}T00:00:00.000Z`),
        idempotencyKey: `nwhc-${dayWorker.id}-OUT`,
        registrationMethod: 'PC',
        deviceId: 'nwhc-test-device',
        integrityFlags: [],
      },
    });

    const recalcRes = await request(app.getHttpServer())
      .post('/admin/compliance-reports/night-work-health-checkup/recalculate')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ siteId: fixture.siteA.id, asOfDate: day });
    expect(recalcRes.status).toBe(201);

    const status = await prisma.nightWorkHealthCheckupStatus.findUnique({ where: { employeeId: dayWorker.id } });
    expect(status?.eligible).toBe(false);
  }, 30000);
});
