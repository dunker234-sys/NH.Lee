import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';
import { resetDatabase, adminPrisma } from './setup/db';
import { login } from './setup/auth-helper';
import { BulkSiteFixture, loadBulkSiteFixture } from './fixtures';
import { buildMigrationWorkbook } from './migration-workbook.util';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** 요구사항서4.3(STEP7.5) 완료조건2: 의도적으로 1건을 틀리게 넣으면 검증
 * 리포트가 해당 근로자를 지목한다. */
describe('개시 데이터 이관 — 행 단위 검증 오류 리포트', () => {
  let app: INestApplication;
  let bulk: BulkSiteFixture;
  const CUTOVER_DATE = '2026-09-01';

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    bulk = await loadBulkSiteFixture(5, 'rowerr');
    await adminPrisma.leaveType.create({
      data: { code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' },
    });
    const { accessToken } = await login(app, bulk.hqHr.employeeNo, bulk.password, 'dev-migration-rowerr-setup');
    await request(app.getHttpServer())
      .post('/admin/migration/cutover')
      .set(auth(accessToken))
      .send({ siteId: bulk.site.id, cutoverDate: CUTOVER_DATE });
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('잔액이 음수인 근로자 1명을 리포트가 정확히 지목한다', async () => {
    const { accessToken } = await login(app, bulk.hqHr.employeeNo, bulk.password, 'dev-migration-rowerr-negative');
    const badEmployee = bulk.employees[2];

    const leaveBalanceRows = bulk.employees.map((e, i) =>
      i === 2
        ? [e.employeeNo, 'ANNUAL', CUTOVER_DATE, CUTOVER_DATE, '2027-08-31', 15, -1, 0, 0, '오류행']
        : [e.employeeNo, 'ANNUAL', CUTOVER_DATE, CUTOVER_DATE, '2027-08-31', 15, 0, 0, 0, '정상'],
    );
    const fileBuffer = await buildMigrationWorkbook({ leaveBalance: leaveBalanceRows });

    const res = await request(app.getHttpServer())
      .post('/admin/migration/excel/validate')
      .set(auth(accessToken))
      .field('siteId', bulk.site.id)
      .attach('file', fileBuffer, 'migration.xlsx');

    expect(res.status).toBe(201);
    expect(res.body.commitToken).toBeNull();
    expect(res.body.rowErrors.length).toBeGreaterThan(0);
    expect(res.body.rowErrors.some((e: { employeeNo?: string; sheet: string }) => e.employeeNo === badEmployee.employeeNo && e.sheet === '연차잔액')).toBe(true);
    // 정상 행이었던 다른 근로자는 오류 목록에 없어야 한다(오탐 없음).
    const okEmployee = bulk.employees[0];
    expect(res.body.rowErrors.some((e: { employeeNo?: string }) => e.employeeNo === okEmployee.employeeNo)).toBe(false);
  });

  it('존재하지 않는 사번을 리포트가 정확히 지목한다', async () => {
    const { accessToken } = await login(app, bulk.hqHr.employeeNo, bulk.password, 'dev-migration-rowerr-unknown');
    const fileBuffer = await buildMigrationWorkbook({
      leaveBalance: [['NOT-A-REAL-EMPLOYEE', 'ANNUAL', CUTOVER_DATE, CUTOVER_DATE, '2027-08-31', 15, 0, 0, 0, '']],
    });

    const res = await request(app.getHttpServer())
      .post('/admin/migration/excel/validate')
      .set(auth(accessToken))
      .field('siteId', bulk.site.id)
      .attach('file', fileBuffer, 'migration.xlsx');

    expect(res.status).toBe(201);
    expect(res.body.commitToken).toBeNull();
    expect(res.body.rowErrors).toHaveLength(1);
    expect(res.body.rowErrors[0].employeeNo).toBe('NOT-A-REAL-EMPLOYEE');
  });
});
