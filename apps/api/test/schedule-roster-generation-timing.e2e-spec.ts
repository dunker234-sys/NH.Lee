import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadSchedulePolicyConfigFixture } from './fixtures';

function timeOfDay(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}

/**
 * 완료조건: 평균 10명, 최대 30명 사업장 기준 30일치 편성이 3초 이내(벌크
 * 인서트). punches-p95.e2e-spec.ts 관례 그대로 — 스펙 로컬로 30명을 만들고
 * (fixtures.ts를 건드리지 않는다), 단일 벌크 생성 호출 앞뒤로 performance.now()를
 * 잰다.
 */
describe('POST /admin/schedule/rosters/generate — 30명×30일 3초 이내', () => {
  let app: INestApplication;
  let fixture: Fixture;
  let employeeIds: string[];
  let templateId: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadSchedulePolicyConfigFixture();
    app = await createTestApp();

    const passwordHash = await bcrypt.hash(fixture.password, 4);
    const created: string[] = [];
    for (let i = 0; i < 30; i++) {
      const no = `T-ROSTER-${String(i).padStart(2, '0')}`;
      const employee = await adminPrisma.employee.create({
        data: {
          employeeNo: no,
          name: `로스터테스트-${i}`,
          employmentType: 'REGULAR',
          hireDate: new Date('2024-01-01'),
          primarySiteId: fixture.siteA.id,
          role: 'EMPLOYEE',
        },
      });
      await adminPrisma.employeeCredential.create({ data: { employeeId: employee.id, passwordHash, mustChangePassword: false } });
      await adminPrisma.employeeSiteAssignment.create({
        data: { employeeId: employee.id, siteId: fixture.siteA.id, assignmentRole: 'PRIMARY', startDate: new Date('2024-01-01') },
      });
      created.push(employee.id);
    }
    employeeIds = created;

    const template = await adminPrisma.shiftTemplate.create({
      data: {
        siteId: fixture.siteA.id,
        name: '중식조',
        startTime: timeOfDay('09:00'),
        endTime: timeOfDay('18:00'),
        breakStartTime: timeOfDay('12:00'),
        breakEndTime: timeOfDay('13:00'),
        crossesMidnight: false,
        applicableWeekdays: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    templateId = template.id;
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('30명×30일(900행) 벌크 편성 생성이 3초 이내에 완료된다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-roster-timing');

    const assignments = employeeIds.map((employeeId) => ({
      employeeId,
      cycleLengthDays: 1,
      pattern: [templateId],
      anchorDate: '2026-09-01',
    }));

    const start = performance.now();
    const res = await request(app.getHttpServer())
      .post('/admin/schedule/rosters/generate')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({ siteId: fixture.siteA.id, startDate: '2026-09-01', endDate: '2026-09-30', assignments });
    const elapsedMs = performance.now() - start;

    // eslint-disable-next-line no-console
    console.log(`[roster-generation timing] 30명×30일(900행) 벌크 생성: ${elapsedMs.toFixed(1)}ms`);

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(900);
    expect(elapsedMs).toBeLessThan(3000);
  }, 60000);
});
