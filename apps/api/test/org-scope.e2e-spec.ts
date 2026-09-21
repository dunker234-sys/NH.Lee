import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { Fixture, loadFixture } from './fixtures';

/** STEP 2 완료조건 1: 다른 사업장 데이터 조회 시도 → 거부. */
describe('조직 스코프 가드 (GET /employees)', () => {
  let app: INestApplication;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(employeeNo: string, deviceId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ employeeNo, password: fixture.password, deviceId });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  it('SITE_MANAGER는 자기 사업장 데이터를 조회할 수 있다', async () => {
    const token = await login(fixture.employees.siteManagerA.employeeNo, 'dev-a');

    const res = await request(app.getHttpServer())
      .get(`/employees?siteId=${fixture.siteA.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((e: { id: string }) => typeof e.id === 'string')).toBe(true);
  });

  it('SITE_MANAGER가 다른 사업장 데이터를 조회하면 403(ORG_SCOPE_DENIED)으로 거부된다', async () => {
    const token = await login(fixture.employees.siteManagerA.employeeNo, 'dev-a');

    const res = await request(app.getHttpServer())
      .get(`/employees?siteId=${fixture.siteB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORG_SCOPE_DENIED');
  });

  it('siteId를 지정하지 않으면 스코프 내로 자동 필터되어 다른 사업장 직원은 보이지 않는다', async () => {
    const token = await login(fixture.employees.siteManagerA.employeeNo, 'dev-a');

    const res = await request(app.getHttpServer()).get('/employees').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const employeeNos = res.body.map((e: { employeeNo: string }) => e.employeeNo);
    expect(employeeNos).toContain(fixture.employees.siteManagerA.employeeNo);
    expect(employeeNos).not.toContain(fixture.employees.siteManagerB.employeeNo);
  });

  it('HQ_HR은 ALL 스코프라 어느 사업장이든 조회할 수 있다', async () => {
    const token = await login(fixture.employees.hqHr.employeeNo, 'dev-hq');

    const res = await request(app.getHttpServer())
      .get(`/employees?siteId=${fixture.siteB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('REGIONAL은 같은 권역 내 다른 사업장(siteB)도 조회할 수 있다', async () => {
    const token = await login(fixture.employees.regional.employeeNo, 'dev-regional');

    const res = await request(app.getHttpServer())
      .get(`/employees?siteId=${fixture.siteB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('EMPLOYEE 역할은 이 엔드포인트 자체를 호출할 권한이 없다(역할 축)', async () => {
    const token = await login(fixture.employees.plainEmployeeA.employeeNo, 'dev-emp');

    const res = await request(app.getHttpServer()).get('/employees').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_DENIED');
  });

  it('토큰 없이 호출하면 401이다', async () => {
    const res = await request(app.getHttpServer()).get('/employees');
    expect(res.status).toBe(401);
  });
});
