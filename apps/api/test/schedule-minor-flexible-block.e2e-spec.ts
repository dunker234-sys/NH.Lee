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
 * 완료조건: 18세 미만 근로자에게 탄력근무 배정 시 저장이 차단된다.
 * 서면합의는 미리 심어 둬 "서면합의 미비"가 아니라 "미성년"이 유일한
 * 차단 사유임을 격리해 증명한다.
 */
describe('POST /admin/schedule/rosters/generate — 미성년 근로자 유연근로제 배정 차단', () => {
  let app: INestApplication;
  let fixture: Fixture;
  let flexibleTemplateId: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadSchedulePolicyConfigFixture();
    app = await createTestApp();

    await adminPrisma.laborAgreement.create({
      data: {
        siteId: fixture.siteA.id,
        agreementType: 'FLEXIBLE_QUARTERLY',
        effectiveStartDate: new Date('2020-01-01'),
        documentReference: '테스트 서면합의 문서',
        signedDate: new Date('2020-01-01'),
        representativeName: '테스트근로자대표',
      },
    });

    const template = await adminPrisma.shiftTemplate.create({
      data: {
        siteId: fixture.siteA.id,
        name: '탄력근무(3개월제)',
        startTime: timeOfDay('09:00'),
        endTime: timeOfDay('18:00'),
        crossesMidnight: false,
        applicableWeekdays: [1, 2, 3, 4, 5, 6, 7],
        flexibleWorkType: 'FLEXIBLE_QUARTERLY',
      },
    });
    flexibleTemplateId = template.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  async function createEmployee(no: string, birthDate: Date | null): Promise<string> {
    const passwordHash = await bcrypt.hash(fixture.password, 4);
    const employee = await adminPrisma.employee.create({
      data: {
        employeeNo: no,
        name: `테스트-${no}`,
        employmentType: 'REGULAR',
        hireDate: new Date('2024-01-01'),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
        birthDate: birthDate ?? undefined,
      },
    });
    await adminPrisma.employeeCredential.create({ data: { employeeId: employee.id, passwordHash, mustChangePassword: false } });
    await adminPrisma.employeeSiteAssignment.create({
      data: { employeeId: employee.id, siteId: fixture.siteA.id, assignmentRole: 'PRIMARY', startDate: new Date('2024-01-01') },
    });
    return employee.id;
  }

  it('만 18세 미만 근로자에게 유연근로제 배정 시 저장이 차단된다(400 SCHEDULE_HARD_BLOCK)', async () => {
    const minorId = await createEmployee('T-MINOR', new Date('2010-06-15')); // 2026-09-01 기준 만 16세

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-minor-block');
    const res = await request(app.getHttpServer())
      .post('/admin/schedule/rosters/generate')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({
        siteId: fixture.siteA.id,
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        assignments: [{ employeeId: minorId, cycleLengthDays: 1, pattern: [flexibleTemplateId], anchorDate: '2026-09-01' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SCHEDULE_HARD_BLOCK');
    expect(res.body.details.violations.some((v: { code: string }) => v.code === 'FlexibleWorkNotEligibleError')).toBe(true);

    const persisted = await adminPrisma.schedule.findFirst({ where: { employeeId: minorId } });
    expect(persisted).toBeNull(); // 아무 행도 저장되지 않았다(전부-아니면-없음)
  });

  it('생년월일이 등록되지 않은 근로자도 판정 불가로 차단된다(허용 아님)', async () => {
    const unknownAgeId = await createEmployee('T-NOBIRTH', null);

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-nobirth-block');
    const res = await request(app.getHttpServer())
      .post('/admin/schedule/rosters/generate')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({
        siteId: fixture.siteA.id,
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        assignments: [{ employeeId: unknownAgeId, cycleLengthDays: 1, pattern: [flexibleTemplateId], anchorDate: '2026-09-01' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SCHEDULE_HARD_BLOCK');
    expect(res.body.details.violations.some((v: { code: string }) => v.code === 'BIRTH_DATE_MISSING')).toBe(true);

    const persisted = await adminPrisma.schedule.findFirst({ where: { employeeId: unknownAgeId } });
    expect(persisted).toBeNull();
  });

  it('성인 근로자는 같은 서면합의 하에 정상 배정된다(대조군)', async () => {
    const adultId = await createEmployee('T-ADULT', new Date('1990-01-01'));

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-adult-ok');
    const res = await request(app.getHttpServer())
      .post('/admin/schedule/rosters/generate')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({
        siteId: fixture.siteA.id,
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        assignments: [{ employeeId: adultId, cycleLengthDays: 1, pattern: [flexibleTemplateId], anchorDate: '2026-09-01' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
  });
});
