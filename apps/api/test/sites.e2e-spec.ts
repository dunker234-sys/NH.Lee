import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture } from './fixtures';

describe('GET /sites — 본인 사업장 배정 조회', () => {
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

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('본인의 활성 배정만 반환하고 타 직원의 배정은 노출하지 않는다', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-sites-1');

    const res = await request(app.getHttpServer()).get('/sites').set(authHeader(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(fixture.siteA.id);
    // 관리자용 내부 필드는 노출하지 않는다.
    expect(res.body.items[0]).not.toHaveProperty('headcountCache');
    expect(res.body.items[0]).not.toHaveProperty('qrTotpSecretEncrypted');

    const otherRes = await request(app.getHttpServer()).get('/sites').set(authHeader(accessToken));
    expect(otherRes.body.items.map((s: { id: string }) => s.id)).not.toContain(fixture.siteB.id);
  });

  it('종료된 배정(endDate 과거)은 목록에서 제외된다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-sites-2');

    // siteManagerA는 siteA에 활성 배정을 이미 갖고 있다(loadFixture) — siteB에 종료된 배정을 추가한다.
    await adminPrisma.employeeSiteAssignment.create({
      data: {
        employeeId: fixture.employees.siteManagerA.id,
        siteId: fixture.siteB.id,
        assignmentRole: 'SECONDARY',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-06-30'),
      },
    });

    const res = await request(app.getHttpServer()).get('/sites').set(authHeader(accessToken));
    expect(res.status).toBe(200);
    const ids = res.body.items.map((s: { id: string }) => s.id);
    expect(ids).toContain(fixture.siteA.id);
    expect(ids).not.toContain(fixture.siteB.id);
  });

  it('GET /sites/:id는 본인 배정이 아니어도 사업장 이름 해석용으로 조회 가능하다', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-sites-3');

    const res = await request(app.getHttpServer()).get(`/sites/${fixture.siteB.id}`).set(authHeader(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fixture.siteB.id);
  });
});
