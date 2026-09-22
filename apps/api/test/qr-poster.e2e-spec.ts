import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture } from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** 관리자용 인쇄용 일단위 QR 발급/조회(수정사항: PC 타각 일단위 QR 출력). */
describe('관리자용 인쇄용 QR(admin/punch/qr-poster)', () => {
  let app: INestApplication;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    app = await createTestApp();
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('EMPLOYEE 역할은 403으로 거부된다', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-qr-poster-block');
    const res = await request(app.getHttpServer())
      .get(`/admin/punch/qr-poster?siteId=${fixture.siteA.id}`)
      .set(auth(accessToken));
    expect(res.status).toBe(403);
  });

  it('발급 전에는 404(QR_SECRET_NOT_PROVISIONED)를 반환한다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-qr-poster-404');
    const res = await request(app.getHttpServer())
      .get(`/admin/punch/qr-poster?siteId=${fixture.siteA.id}`)
      .set(auth(accessToken));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('QR_SECRET_NOT_PROVISIONED');
  });

  it('다른 사업장 소속 SITE_MANAGER는 조회할 수 없다(조직 스코프)', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerB.employeeNo, fixture.password, 'dev-qr-poster-scope');
    const res = await request(app.getHttpServer())
      .get(`/admin/punch/qr-poster?siteId=${fixture.siteA.id}`)
      .set(auth(accessToken));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORG_SCOPE_DENIED');
  });

  it('발급(provision) 후 같은 근로일에는 항상 같은 코드를 반환한다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-qr-poster-provision');
    const provisionRes = await request(app.getHttpServer())
      .post('/admin/punch/qr-poster/provision')
      .set(auth(accessToken))
      .send({ siteId: fixture.siteA.id });
    expect(provisionRes.status).toBe(201);
    expect(provisionRes.body.code).toMatch(/^\d{6}$/);
    expect(provisionRes.body.workDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const getRes = await request(app.getHttpServer())
      .get(`/admin/punch/qr-poster?siteId=${fixture.siteA.id}`)
      .set(auth(accessToken));
    expect(getRes.status).toBe(200);
    expect(getRes.body.code).toBe(provisionRes.body.code);
    expect(getRes.body.workDate).toBe(provisionRes.body.workDate);
  });
});
