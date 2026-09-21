import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PayrollPeriodClosedError } from '../src/modules/recalculation/errors/recalculation-errors';
import { RecalculationService } from '../src/modules/recalculation/recalculation.service';
import { EmployeePrincipal } from '../src/common/principal/principal.types';
import { createTestApp } from './setup/app';
import { resetDatabase, adminPrisma } from './setup/db';
import { login } from './setup/auth-helper';
import { BulkSiteFixture, loadBulkSiteFixture, loadPolicyConfigFixture } from './fixtures';
import { buildMigrationWorkbook } from './migration-workbook.util';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** §Context 핵심 설계 회귀 방지: 이관된 마감월 데이터는 assertPayrollOpen()
 * 기존 가드로 재계산 클로버링이 자동 방지된다(consumer를 패치하지 않았다). */
describe('개시 데이터 이관 — 마감 완료 과거월이 재계산으로부터 보호된다', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bulk: BulkSiteFixture;
  const CUTOVER_DATE = '2026-09-01';

  beforeAll(async () => {
    await resetDatabase();
    await loadPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bulk = await loadBulkSiteFixture(1, 'closeprot');

    const { accessToken } = await login(app, bulk.hqHr.employeeNo, bulk.password, 'dev-migration-closeprot');
    await request(app.getHttpServer()).post('/admin/migration/cutover').set(auth(accessToken)).send({ siteId: bulk.site.id, cutoverDate: CUTOVER_DATE });

    const employee = bulk.employees[0];
    const fileBuffer = await buildMigrationWorkbook({
      attendanceMonthly: [[employee.employeeNo, '2026-08', 9600, 9600, 0, 0, 0, 0, 0, 0, 0]],
    });
    const validateRes = await request(app.getHttpServer())
      .post('/admin/migration/excel/validate')
      .set(auth(accessToken))
      .field('siteId', bulk.site.id)
      .attach('file', fileBuffer, 'migration.xlsx');
    expect(validateRes.status).toBe(201);
    expect(validateRes.body.rowErrors).toEqual([]);

    const commitRes = await request(app.getHttpServer())
      .post('/admin/migration/excel/commit')
      .set(auth(accessToken))
      .send({ commitToken: validateRes.body.commitToken });
    expect(commitRes.status).toBe(201);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('마감월집계 이관이 PayrollClose(CLOSED)를 함께 만들고, 그 월 재계산은 PayrollPeriodClosedError로 거부된다', async () => {
    const employee = bulk.employees[0];

    const payrollClose = await prisma.payrollClose.findUniqueOrThrow({ where: { siteId_periodYearMonth: { siteId: bulk.site.id, periodYearMonth: '2026-08' } } });
    expect(payrollClose.status).toBe('CLOSED');

    const monthlyBefore = await prisma.attendanceMonthly.findUniqueOrThrow({ where: { employeeId_yearMonth: { employeeId: employee.id, yearMonth: '2026-08' } } });
    expect(monthlyBefore.source).toBe('MIGRATION');
    expect((monthlyBefore.totals as { actualWorkMinutes: number }).actualWorkMinutes).toBe(9600);

    const recalculationService = app.get(RecalculationService);
    const principal: EmployeePrincipal = { kind: 'EMPLOYEE', employeeId: employee.id, employeeNo: employee.employeeNo, role: 'ADMIN', status: 'ACTIVE' };

    await expect(recalculationService.recalculateSingleDay(employee.id, '2026-08-15', principal)).rejects.toThrow(PayrollPeriodClosedError);

    // 재계산 시도가 실패했으니 이관된 월합계는 그대로 보존돼야 한다.
    const monthlyAfter = await adminPrisma.attendanceMonthly.findUniqueOrThrow({ where: { employeeId_yearMonth: { employeeId: employee.id, yearMonth: '2026-08' } } });
    expect((monthlyAfter.totals as { actualWorkMinutes: number }).actualWorkMinutes).toBe(9600);
    expect(monthlyAfter.source).toBe('MIGRATION');
  });
});
