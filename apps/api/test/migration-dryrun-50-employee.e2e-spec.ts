import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase, adminPrisma } from './setup/db';
import { login } from './setup/auth-helper';
import { BulkSiteFixture, loadBulkSiteFixture } from './fixtures';
import { buildMigrationWorkbook } from './migration-workbook.util';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** 요구사항서4.3(STEP7.5) 완료조건1: 50명 규모 사업장 샘플이 dry-run에서
 * 오류 없이 검증된다. */
describe('개시 데이터 이관 — 50명 규모 dry-run', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bulk: BulkSiteFixture;
  const CUTOVER_DATE = '2026-09-01';

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bulk = await loadBulkSiteFixture(50, 'dryrun50');
    await adminPrisma.leaveType.create({
      data: { code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' },
    });
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('50명 전원의 연차잔액·마감월집계·교대패턴·확정스케줄이 오류 없이 검증되고, 아무것도 적재되지 않는다', async () => {
    const { accessToken } = await login(app, bulk.hqHr.employeeNo, bulk.password, 'dev-migration-dryrun-50');

    const cutoverRes = await request(app.getHttpServer())
      .post('/admin/migration/cutover')
      .set(auth(accessToken))
      .send({ siteId: bulk.site.id, cutoverDate: CUTOVER_DATE });
    expect(cutoverRes.status).toBe(201);

    const leaveBalanceRows = bulk.employees.map((e) => [e.employeeNo, 'ANNUAL', CUTOVER_DATE, CUTOVER_DATE, '2027-08-31', 15, 0, 0, 0, '이관']);
    const attendanceMonthlyRows = bulk.employees.map((e) => [e.employeeNo, '2026-08', 9600, 9600, 0, 0, 0, 0, 0, 0, 0]);
    const scheduleRows = bulk.employees.map((e) => [e.employeeNo, '2026-09-15', '주간', 60]);

    const fileBuffer = await buildMigrationWorkbook({
      leaveBalance: leaveBalanceRows,
      attendanceMonthly: attendanceMonthlyRows,
      shiftTemplate: [['주간', '09:00', '18:00', '', '', 'N', '1,2,3,4,5']],
      schedule: scheduleRows,
    });

    const validateRes = await request(app.getHttpServer())
      .post('/admin/migration/excel/validate')
      .set(auth(accessToken))
      .field('siteId', bulk.site.id)
      .attach('file', fileBuffer, 'migration.xlsx');

    expect(validateRes.status).toBe(201);
    expect(validateRes.body.rowErrors).toEqual([]);
    expect(validateRes.body.commitToken).toEqual(expect.any(String));

    // dry-run이므로 아직 아무것도 적재되지 않아야 한다.
    const leaveBalanceCount = await prisma.leaveBalance.count();
    const attendanceMonthlyCount = await prisma.attendanceMonthly.count();
    const scheduleCount = await prisma.schedule.count();
    const shiftTemplateCount = await prisma.shiftTemplate.count();
    expect(leaveBalanceCount).toBe(0);
    expect(attendanceMonthlyCount).toBe(0);
    expect(scheduleCount).toBe(0);
    expect(shiftTemplateCount).toBe(0);
  }, 30000);
});
