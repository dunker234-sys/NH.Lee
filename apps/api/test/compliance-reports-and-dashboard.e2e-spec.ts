import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture } from './fixtures';

function workDateOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** 요구사항서 4.4④·⑤ 준법 리포트·대시보드가 이미 계산된 데이터를 정확히 읽어오는지 확인한다. */
describe('ComplianceReports & Dashboard — 요구사항서 4.4④⑤', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('위반 이력 리포트 — limitViolationFlag=true인 주만 조회되고 알림단계가 함께 반환된다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'compliance-test');

    const violator = await prisma.employee.create({
      data: {
        employeeNo: 'T-VIOLATOR',
        name: '위반직원',
        employmentType: 'REGULAR',
        hireDate: new Date('2024-01-01'),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });
    await prisma.attendanceWeekly.create({
      data: {
        employeeId: violator.id,
        weekStartDate: workDateOf('2026-04-06'),
        totalWorkMinutes: 3200,
        over40Minutes: 800,
        limitViolationFlag: true,
        weeklyBasisOvertimeMinutes: 0,
        totalOvertimeForPremiumMinutes: 800,
        flexibleWorkSkipped: false,
        alertStage: 'EXCEEDED',
      },
    });
    await prisma.attendanceWeekly.create({
      data: {
        employeeId: fixture.employees.plainEmployeeA.id,
        weekStartDate: workDateOf('2026-04-06'),
        totalWorkMinutes: 2000,
        over40Minutes: 0,
        limitViolationFlag: false,
        weeklyBasisOvertimeMinutes: 0,
        totalOvertimeForPremiumMinutes: 0,
        flexibleWorkSkipped: false,
        alertStage: 'NONE',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/admin/compliance-reports/overtime-stats/violation-history')
      .query({ from: '2026-04-01', to: '2026-04-30' })
      .set({ Authorization: `Bearer ${accessToken}` });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].employeeId).toBe(violator.id);
    expect(res.body[0].alertStage).toBe('EXCEEDED');
  });

  it('사업장별 비교 — 위험 인원(alertStage DANGER/EXCEEDED)이 사업장별로 집계된다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'compliance-test-2');

    const res = await request(app.getHttpServer())
      .get('/admin/compliance-reports/overtime-stats/site-comparison')
      .query({ period: '2026-04' })
      .set({ Authorization: `Bearer ${accessToken}` });

    expect(res.status).toBe(200);
    const siteARow = res.body.find((r: { siteId: string }) => r.siteId === fixture.siteA.id);
    expect(siteARow.atRiskEmployeeCount).toBeGreaterThanOrEqual(1);
    expect(siteARow.violationWeekCount).toBeGreaterThanOrEqual(1);
  });

  it('위반 이력 엑셀 내보내기 — xlsx 콘텐츠 타입으로 응답한다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'compliance-test-3');

    const res = await request(app.getHttpServer())
      .get('/admin/compliance-reports/overtime-stats/violation-history/export')
      .query({ from: '2026-04-01', to: '2026-04-30' })
      .set({ Authorization: `Bearer ${accessToken}` });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  it('HQ 대시보드 — 관할 인원·위험 인원 등을 2초 이내 반환한다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'compliance-test-4');

    const start = performance.now();
    const res = await request(app.getHttpServer())
      .get('/admin/dashboard/hq')
      .set({ Authorization: `Bearer ${accessToken}` });
    const elapsedMs = performance.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.totalHeadcount).toBeGreaterThanOrEqual(0);
    expect(res.body.dayOffCount).toBeGreaterThanOrEqual(0);
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('사업장 대시보드 — SITE_MANAGER가 자기 사업장만 조회할 수 있다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'compliance-test-5');

    const ok = await request(app.getHttpServer())
      .get(`/admin/dashboard/site/${fixture.siteA.id}`)
      .set({ Authorization: `Bearer ${accessToken}` });
    expect(ok.status).toBe(200);
    expect(ok.body.siteId).toBe(fixture.siteA.id);

    const forbidden = await request(app.getHttpServer())
      .get(`/admin/dashboard/site/${fixture.siteB.id}`)
      .set({ Authorization: `Bearer ${accessToken}` });
    expect(forbidden.status).toBe(403);
  });
});
