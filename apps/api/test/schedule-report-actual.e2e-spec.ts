import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPayrollPolicyConfigFixture, loadPolicyConfigFixture } from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function workDateOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** 근무스케쥴(실적) 리포트(수정사항) — 계획/실적 조인에 연장·휴일·6일차·일급·
 * 주휴 요약까지 더해서 반환하는지 확인한다. */
describe('근무스케쥴(실적) 리포트 (admin/schedule/reports/actual)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPayrollPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('EMPLOYEE 역할은 403으로 거부된다', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-actual-report-block');
    const res = await request(app.getHttpServer())
      .get(`/admin/schedule/reports/actual?siteId=${fixture.siteA.id}&yearMonth=2026-07`)
      .set(auth(accessToken));
    expect(res.status).toBe(403);
  });

  it('연속 6일 근무 + 연장근로 + 임금요율이 있으면 일자별 연장/6일차/일급과 월 합계가 채워진다', async () => {
    const employee = await prisma.employee.create({
      data: {
        employeeNo: 'T-ACTUAL-REPORT',
        name: '테스트-실적리포트',
        employmentType: 'REGULAR',
        hireDate: workDateOf('2024-01-01'),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });

    // 2026-07-06(월)~07-11(토) 6일 연속 근무. 마지막 날(07-11)에 연장 60분.
    const workDates = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11'];
    for (const [i, dateStr] of workDates.entries()) {
      await prisma.attendanceDaily.create({
        data: {
          employeeId: employee.id,
          siteId: fixture.siteA.id,
          workDate: workDateOf(dateStr),
          scheduledWorkMinutes: 480,
          actualWorkMinutes: i === workDates.length - 1 ? 540 : 480,
          approvedOvertimeMinutes: i === workDates.length - 1 ? 60 : 0,
          status: 'NORMAL',
          inputSnapshotHash: `test-actual-report-${dateStr}`,
          breakdown: [],
        },
      });
    }

    const { accessToken: hqHrToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-actual-report-hqhr');
    await request(app.getHttpServer())
      .post(`/admin/employees/${employee.id}/wage-rate`)
      .set(auth(hqHrToken))
      .send({ wageType: 'HOURLY', baseAmount: 10000, effectiveStartDate: '2024-01-01' })
      .expect(201);

    const { accessToken: mgrToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-actual-report-mgr');
    const res = await request(app.getHttpServer())
      .get(`/admin/schedule/reports/actual?siteId=${fixture.siteA.id}&yearMonth=2026-07`)
      .set(auth(mgrToken));

    expect(res.status).toBe(200);
    const row = res.body.find((r: { employeeId: string }) => r.employeeId === employee.id);
    expect(row).toBeDefined();
    expect(row.days).toHaveLength(6);

    const lastDay = row.days.find((d: { workDate: string }) => d.workDate === '2026-07-11');
    expect(lastDay.approvedOvertimeMinutes).toBe(60);
    expect(lastDay.consecutiveDayNumber).toBe(6);
    expect(lastDay.dailyWageAmount).toBeGreaterThan(0);

    const firstDay = row.days.find((d: { workDate: string }) => d.workDate === '2026-07-06');
    expect(firstDay.consecutiveDayNumber).toBe(1);

    expect(row.monthTotal.approvedOvertimeMinutes).toBe(60);
    expect(row.monthTotal.actualWorkMinutes).toBe(480 * 5 + 540);
    expect(row.monthTotal.totalWageAmount).toBeGreaterThan(0);
  });
});
