import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadSchedulePolicyConfigFixture } from './fixtures';

function timeOfDay(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * 완료조건: 두 사용자가 같은 사업장 그리드를 동시 편집해도 변경이
 * 소실되지 않는다. (a) 단일 셀 동시 PATCH, (b) 벌크 PATCH 부분 충돌 시
 * 전체 롤백, (c) 엑셀 validate~commit 사이 그리드 편집 발생 시 commit이
 * 그리드 지문 재검증으로 차단(TOCTOU 방지) — 세 시나리오 모두 "변경
 * 소실 없음"의 서로 다른 측면을 증명한다.
 */
describe('schedule 낙관적 잠금 — 동시 편집 충돌', () => {
  let app: INestApplication;
  let fixture: Fixture;
  let managerBAtSiteA: { id: string; employeeNo: string };
  let templateId: string;
  let templateName: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadSchedulePolicyConfigFixture();
    app = await createTestApp();

    // siteManagerB는 fixtures.ts상 siteB 전담이라, siteA를 같이 편집하는
    // "두 번째 관리자"가 필요해 스펙 로컬로 만든다(확립된 관례).
    const passwordHash = await bcrypt.hash(fixture.password, 4);
    const managerB = await adminPrisma.employee.create({
      data: {
        employeeNo: 'T-SM-A2',
        name: '테스트-두번째관리자',
        employmentType: 'REGULAR',
        hireDate: new Date('2024-01-01'),
        primarySiteId: fixture.siteA.id,
        role: 'SITE_MANAGER',
      },
    });
    await adminPrisma.employeeCredential.create({ data: { employeeId: managerB.id, passwordHash, mustChangePassword: false } });
    await adminPrisma.employeeSiteAssignment.create({
      data: { employeeId: managerB.id, siteId: fixture.siteA.id, assignmentRole: 'PRIMARY', startDate: new Date('2024-01-01') },
    });
    managerBAtSiteA = { id: managerB.id, employeeNo: managerB.employeeNo };

    const template = await adminPrisma.shiftTemplate.create({
      data: {
        siteId: fixture.siteA.id,
        name: '표준조',
        startTime: timeOfDay('09:00'),
        endTime: timeOfDay('18:00'),
        crossesMidnight: false,
        applicableWeekdays: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    templateId = template.id;
    templateName = template.name;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  async function createScheduleRow(workDate: string, breakMinutes: number) {
    return adminPrisma.schedule.create({
      data: {
        employeeId: fixture.employees.plainEmployeeA.id,
        siteId: fixture.siteA.id,
        workDate: new Date(`${workDate}T00:00:00.000Z`),
        shiftTemplateId: templateId,
        plannedStartAt: new Date(`${workDate}T00:00:00.000Z`),
        plannedEndAt: new Date(`${workDate}T09:00:00.000Z`),
        plannedBreakMinutes: breakMinutes,
      },
    });
  }

  it('(a) 같은 셀을 동시 PATCH하면 하나만 성공하고 나머지는 409로 거부되며, 패자의 값은 저장되지 않는다', async () => {
    const row = await createScheduleRow('2026-09-05', 0);

    const [tokenA, tokenB] = await Promise.all([
      login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-lock-a'),
      login(app, managerBAtSiteA.employeeNo, fixture.password, 'dev-lock-b'),
    ]);

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/admin/schedule/schedules/${row.id}`)
        .set(auth(tokenA.accessToken))
        .send({ expectedVersion: 1, plannedBreakMinutes: 30 }),
      request(app.getHttpServer())
        .patch(`/admin/schedule/schedules/${row.id}`)
        .set(auth(tokenB.accessToken))
        .send({ expectedVersion: 1, plannedBreakMinutes: 45 }),
    ]);

    const results = [
      { res: resA, sentBreak: 30 },
      { res: resB, sentBreak: 45 },
    ];
    const successes = results.filter((r) => r.res.status === 200);
    const conflicts = results.filter((r) => r.res.status === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].res.body.code).toBe('SCHEDULE_VERSION_CONFLICT');
    expect(conflicts[0].res.body.details.currentValue.plannedBreakMinutes).toBe(successes[0].sentBreak);

    const persisted = await adminPrisma.schedule.findUniqueOrThrow({ where: { id: row.id } });
    expect(persisted.plannedBreakMinutes).toBe(successes[0].sentBreak);
    expect(persisted.version).toBe(2);
  });

  it('(b) 벌크 PATCH는 하나라도 충돌하면 전체 롤백한다(부분 적용 없음)', async () => {
    const row1 = await createScheduleRow('2026-09-06', 0);
    const row2 = await createScheduleRow('2026-09-07', 0);

    const { accessToken: tokenA } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-lock-bulk-a');

    // row1을 먼저 성공적으로 바꿔 버전을 2로 만든다 — 이후 벌크 요청은
    // row1을 여전히 버전1로 알고 있는 stale 클라이언트를 흉내낸다.
    const preRes = await request(app.getHttpServer())
      .patch(`/admin/schedule/schedules/${row1.id}`)
      .set(auth(tokenA))
      .send({ expectedVersion: 1, plannedBreakMinutes: 15 });
    expect(preRes.status).toBe(200);

    const { accessToken: tokenB } = await login(app, managerBAtSiteA.employeeNo, fixture.password, 'dev-lock-bulk-b');
    const bulkRes = await request(app.getHttpServer())
      .patch('/admin/schedule/schedules/bulk')
      .set(auth(tokenB))
      .send({
        cells: [
          { id: row1.id, expectedVersion: 1, plannedBreakMinutes: 60 }, // stale
          { id: row2.id, expectedVersion: 1, plannedBreakMinutes: 60 }, // valid
        ],
      });

    expect(bulkRes.status).toBe(409);
    expect(bulkRes.body.code).toBe('SCHEDULE_BULK_VERSION_CONFLICT');
    expect(bulkRes.body.details.conflicts.some((c: { scheduleId: string }) => c.scheduleId === row1.id)).toBe(true);

    // row2는 자기 버전만 보면 유효했지만, 배치 전체가 롤백돼 반영되지 않아야 한다.
    const persistedRow2 = await adminPrisma.schedule.findUniqueOrThrow({ where: { id: row2.id } });
    expect(persistedRow2.plannedBreakMinutes).toBe(0);
    expect(persistedRow2.version).toBe(1);
  });

  it('(c) 엑셀 validate~commit 사이 그리드가 바뀌면 commit이 그리드 지문 재검증으로 차단한다', async () => {
    const row = await createScheduleRow('2026-09-10', 0);
    const yearMonth = '2026-09';

    const { accessToken: tokenA } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-lock-excel-a');

    const gridRes = await request(app.getHttpServer())
      .get(`/admin/schedule/schedules?siteId=${fixture.siteA.id}&yearMonth=${yearMonth}`)
      .set(auth(tokenA));
    expect(gridRes.status).toBe(200);
    const gridVersionAtRead: string = gridRes.body.scheduleGridVersion;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('편성');
    sheet.addRow(['사번', '근무일(YYYY-MM-DD)', '교대패턴명', '휴게(분)']);
    sheet.addRow([fixture.employees.plainEmployeeA.employeeNo, '2026-09-10', templateName, 45]);
    const fileBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const validateRes = await request(app.getHttpServer())
      .post('/admin/schedule/excel/validate')
      .set(auth(tokenA))
      .field('siteId', fixture.siteA.id)
      .field('yearMonth', yearMonth)
      .field('clientGridVersion', gridVersionAtRead)
      .attach('file', fileBuffer, 'roster.xlsx');

    expect(validateRes.status).toBe(201);
    expect(validateRes.body.rowErrors).toEqual([]);
    expect(validateRes.body.conflictDiff).toBeNull();
    const commitToken: string = validateRes.body.commitToken;
    expect(commitToken).toEqual(expect.any(String));

    // validate 이후, commit 이전에 다른 사용자가 같은 행을 먼저 바꾼다.
    const { accessToken: tokenB } = await login(app, managerBAtSiteA.employeeNo, fixture.password, 'dev-lock-excel-b');
    const interleavedPatch = await request(app.getHttpServer())
      .patch(`/admin/schedule/schedules/${row.id}`)
      .set(auth(tokenB))
      .send({ expectedVersion: 1, plannedBreakMinutes: 99 });
    expect(interleavedPatch.status).toBe(200);

    const commitRes = await request(app.getHttpServer()).post('/admin/schedule/excel/commit').set(auth(tokenA)).send({ commitToken });

    expect(commitRes.status).toBe(409);
    expect(commitRes.body.code).toBe('SCHEDULE_GRID_STALE');

    // 엑셀 커밋이 조용히 덮어쓰지 않았음을 확인 — 그 사이 편집(99)이 그대로 살아있다.
    const persisted = await adminPrisma.schedule.findUniqueOrThrow({ where: { id: row.id } });
    expect(persisted.plannedBreakMinutes).toBe(99);
  });
});
