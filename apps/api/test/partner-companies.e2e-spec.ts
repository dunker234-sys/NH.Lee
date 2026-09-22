import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture } from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** 협력업체 관리 재구성(수정사항) — 관리자 계정 발급/퇴사자 등록/인건비 확인. */
describe('협력업체 관리 (admin/partner-companies)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let companyId: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-partner-setup');
    const createRes = await request(app.getHttpServer())
      .post('/admin/partner-companies')
      .set(auth(accessToken))
      .send({ code: 'PTN-001', name: '테스트협력업체' });
    expect(createRes.status).toBe(201);
    companyId = createRes.body.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('협력업체 관리자 계정을 발급하면 임시 비밀번호가 응답에 한 번 노출되고, 그 계정으로 로그인해 자사 소속 직원을 조회할 수 있다', async () => {
    const { accessToken: hqToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-partner-admin-reg');
    const registerRes = await request(app.getHttpServer())
      .post(`/admin/partner-companies/${companyId}/admins`)
      .set(auth(hqToken))
      .send({ employeeNo: 'PTN-ADMIN-1', name: '협력사담당자', primarySiteId: fixture.siteA.id });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.tempPassword).toBeTruthy();
    expect(typeof registerRes.body.tempPassword).toBe('string');

    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: registerRes.body.id } });
    expect(employee.role).toBe('PARTNER');
    expect(employee.partnerCompanyId).toBe(companyId);

    // 발급된 임시 비밀번호로 실제 로그인이 된다(최초 로그인 비밀번호 변경 강제 전제).
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ employeeNo: 'PTN-ADMIN-1', password: registerRes.body.tempPassword, deviceId: 'dev-partner-admin-device' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.mustChangePassword).toBe(true);

    // 최초 로그인 비밀번호 변경을 마쳐야 이후 요청이 MUST_CHANGE_PASSWORD로
    // 막히지 않는다(principal.guard.ts).
    const changePasswordRes = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set(auth(loginRes.body.accessToken))
      .send({ currentPassword: registerRes.body.tempPassword, newPassword: 'NewPass!2026' });
    expect(changePasswordRes.status).toBe(200);

    // 파견직 입사자를 하나 등록해 self-service 조회 대상으로 삼는다.
    await request(app.getHttpServer())
      .post(`/admin/partner-companies/${companyId}/employees`)
      .set(auth(hqToken))
      .send({ employeeNo: 'PTN-WORKER-1', name: '파견직원1', primarySiteId: fixture.siteA.id, hireDate: '2026-01-01' })
      .expect(201);

    const meRes = await request(app.getHttpServer())
      .get('/me/partner/employees')
      .set(auth(loginRes.body.accessToken));
    expect(meRes.status).toBe(200);
    expect(meRes.body.some((e: { employeeNo: string }) => e.employeeNo === 'PTN-WORKER-1')).toBe(true);

    // PARTNER 역할로는 다른 관리자 엔드포인트를 호출할 수 없다.
    const forbiddenRes = await request(app.getHttpServer())
      .get('/admin/partner-companies')
      .set(auth(loginRes.body.accessToken));
    expect(forbiddenRes.status).toBe(403);
  });

  it('파견직 퇴사자 등록 — 다른 협력업체 소속이면 거부되고, 소속 직원이면 RESIGNED로 전환된다', async () => {
    const { accessToken: hqToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-partner-resign');

    const otherCompanyRes = await request(app.getHttpServer())
      .post('/admin/partner-companies')
      .set(auth(hqToken))
      .send({ code: 'PTN-002', name: '다른협력업체' });
    const otherCompanyId = otherCompanyRes.body.id;

    const workerRes = await request(app.getHttpServer())
      .post(`/admin/partner-companies/${companyId}/employees`)
      .set(auth(hqToken))
      .send({ employeeNo: 'PTN-WORKER-2', name: '파견직원2', primarySiteId: fixture.siteA.id, hireDate: '2026-01-01' });
    const workerId = workerRes.body.id;

    const wrongCompanyRes = await request(app.getHttpServer())
      .post(`/admin/partner-companies/${otherCompanyId}/employees/${workerId}/resign`)
      .set(auth(hqToken))
      .send({ resignationDate: '2026-06-30' });
    expect(wrongCompanyRes.status).toBe(400);
    expect(wrongCompanyRes.body.code).toBe('EMPLOYEE_NOT_IN_PARTNER_COMPANY');

    const resignRes = await request(app.getHttpServer())
      .post(`/admin/partner-companies/${companyId}/employees/${workerId}/resign`)
      .set(auth(hqToken))
      .send({ resignationDate: '2026-06-30' });
    expect(resignRes.status).toBe(201);
    expect(resignRes.body.status).toBe('RESIGNED');

    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: workerId } });
    expect(employee.status).toBe('RESIGNED');
    expect(employee.resignationDate?.toISOString().slice(0, 10)).toBe('2026-06-30');

    const auditRow = await prisma.auditLog.findFirst({ where: { eventType: 'PARTNER_EMPLOYEE_RESIGNED', resourceId: workerId } });
    expect(auditRow).not.toBeNull();
  });

  it('파견직 인건비 확인 — 등록된 임금요율을 반환하고, 퇴사자는 제외한다', async () => {
    const { accessToken: hqToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-partner-laborcost');

    const workerRes = await request(app.getHttpServer())
      .post(`/admin/partner-companies/${companyId}/employees`)
      .set(auth(hqToken))
      .send({ employeeNo: 'PTN-WORKER-3', name: '파견직원3', primarySiteId: fixture.siteA.id, hireDate: '2026-01-01' });
    const workerId = workerRes.body.id;

    await request(app.getHttpServer())
      .post(`/admin/employees/${workerId}/wage-rate`)
      .set(auth(hqToken))
      .send({ wageType: 'HOURLY', baseAmount: 12000, effectiveStartDate: '2026-01-01' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/admin/partner-companies/${companyId}/labor-cost?asOfDate=2026-06-01`)
      .set(auth(hqToken));
    expect(res.status).toBe(200);
    const row = res.body.find((r: { employeeNo: string }) => r.employeeNo === 'PTN-WORKER-3');
    expect(row).toBeDefined();
    expect(row.wageType).toBe('HOURLY');
    expect(row.baseAmount).toBe(12000);

    // 앞선 테스트에서 퇴사 처리된 PTN-WORKER-2는 제외된다.
    expect(res.body.some((r: { employeeNo: string }) => r.employeeNo === 'PTN-WORKER-2')).toBe(false);
  });
});
