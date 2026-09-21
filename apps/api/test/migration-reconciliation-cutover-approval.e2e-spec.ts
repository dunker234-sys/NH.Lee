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

async function commitOneEmployeeLeaveBalance(
  app: INestApplication,
  bulk: BulkSiteFixture,
  cutoverDate: string,
  manualValue: number,
): Promise<void> {
  const { accessToken } = await login(app, bulk.hqHr.employeeNo, bulk.password, `dev-migration-recon-${bulk.site.id}`);
  await request(app.getHttpServer()).post('/admin/migration/cutover').set(auth(accessToken)).send({ siteId: bulk.site.id, cutoverDate });

  const employee = bulk.employees[0];
  // 근속 7년(2019-09-01 입사) 직원의 연차가 발생18일-사용0일=18일로 이관된다 —
  // 사용자 프롬프트의 "실제는 7일일 수 있다" 시나리오를 그대로 재현한다.
  const fileBuffer = await buildMigrationWorkbook({
    leaveBalance: [[employee.employeeNo, 'ANNUAL', cutoverDate, cutoverDate, '2027-08-31', 18, 0, 0, 0, '이관']],
    reconciliation: [[employee.employeeNo, 'ANNUAL_LEAVE_REMAINING_DAYS', manualValue]],
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
}

/** 요구사항서4.3(STEP7.5) 완료조건3 + §4 — 사업장별 근로자 단위 대사
 * 리포트, 차이가 0이 될 때까지 개통 승인을 시스템이 차단한다. */
describe('개시 데이터 이관 — 근로자 단위 대사 리포트 & 개통 승인 차단', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const CUTOVER_DATE = '2026-09-01';

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await adminPrisma.leaveType.create({
      data: { code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' },
    });
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('수기값과 이관값이 일치하면 대사 통과 후 개통 승인이 성공한다', async () => {
    const bulk = await loadBulkSiteFixture(3, 'reconok');
    await commitOneEmployeeLeaveBalance(app, bulk, CUTOVER_DATE, 18); // manualValue===migratedValue

    const { accessToken } = await login(app, bulk.hqHr.employeeNo, bulk.password, 'dev-migration-recon-ok-read');
    const readinessRes = await request(app.getHttpServer()).get(`/admin/migration/cutover/readiness?siteId=${bulk.site.id}`).set(auth(accessToken));
    expect(readinessRes.status).toBe(200);
    expect(readinessRes.body.ready).toBe(true);
    expect(readinessRes.body.unresolvedCount).toBe(0);
    expect(readinessRes.body.mismatches).toEqual([]);

    const approveRes = await request(app.getHttpServer()).post('/admin/migration/cutover/approve').set(auth(accessToken)).send({ siteId: bulk.site.id });
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.status).toBe('APPROVED');

    const cutover = await prisma.siteCutover.findUniqueOrThrow({ where: { siteId: bulk.site.id } });
    expect(cutover.status).toBe('APPROVED');
    expect(cutover.approvedBy).toBe(bulk.hqHr.id);
  }, 30000);

  it('수기값(7)과 이관값(18)이 다르면 그 근로자가 리포트에 지목되고 개통 승인이 차단된다', async () => {
    const bulk = await loadBulkSiteFixture(3, 'reconbad');
    await commitOneEmployeeLeaveBalance(app, bulk, CUTOVER_DATE, 7); // manualValue(7) !== migratedValue(18)
    const mismatchedEmployee = bulk.employees[0];

    const { accessToken } = await login(app, bulk.hqHr.employeeNo, bulk.password, 'dev-migration-recon-bad-read');
    const readinessRes = await request(app.getHttpServer()).get(`/admin/migration/cutover/readiness?siteId=${bulk.site.id}`).set(auth(accessToken));
    expect(readinessRes.status).toBe(200);
    expect(readinessRes.body.ready).toBe(false);
    expect(readinessRes.body.unresolvedCount).toBe(1);
    expect(readinessRes.body.mismatches).toHaveLength(1);
    expect(readinessRes.body.mismatches[0].employee.employeeNo).toBe(mismatchedEmployee.employeeNo);
    expect(Number(readinessRes.body.mismatches[0].diff)).toBe(-11); // 7 - 18

    const approveRes = await request(app.getHttpServer()).post('/admin/migration/cutover/approve').set(auth(accessToken)).send({ siteId: bulk.site.id });
    expect(approveRes.status).toBe(400);
    expect(approveRes.body.code).toBe('CUTOVER_RECONCILIATION_NOT_ZERO');
    expect(approveRes.body.details.unresolvedCount).toBe(1);

    const cutover = await prisma.siteCutover.findUniqueOrThrow({ where: { siteId: bulk.site.id } });
    expect(cutover.status).toBe('PENDING');
  }, 30000);
});
