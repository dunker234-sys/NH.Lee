import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture } from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * STEP12: 운영 모니터링 엔드포인트 — 타각 실패율/미등록 건수/배치 성공률/
 * 알림 발송 성공률/미승인 실적 미판정 건수/DLQ 적체 6개 지표를 반환한다.
 */
describe('운영 모니터링 (STEP12)', () => {
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

  it('ADMIN 외 역할(SITE_MANAGER)은 403으로 거부된다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-ops-block');
    const res = await request(app.getHttpServer()).get('/admin/ops/monitoring').set(auth(accessToken));
    expect(res.status).toBe(403);
  });

  it('ADMIN 외 역할(HQ_HR)도 403으로 거부된다(2026-09 수정사항 — 프로그램 관리자 전용 재분류)', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-ops-block-hqhr');
    const res = await request(app.getHttpServer()).get('/admin/ops/monitoring').set(auth(accessToken));
    expect(res.status).toBe(403);
  });

  it('ADMIN은 6개 지표를 조회할 수 있다', async () => {
    const { accessToken } = await login(app, fixture.employees.admin.employeeNo, fixture.password, 'dev-ops-admin');
    const res = await request(app.getHttpServer()).get('/admin/ops/monitoring').set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('punchFailureRatePercent');
    expect(res.body).toHaveProperty('todayNoShowCount');
    expect(res.body).toHaveProperty('unapprovedUnjudgedCount');
    expect(res.body).toHaveProperty('notificationSuccessRatePercent');
    expect(res.body).toHaveProperty('batchSuccessRatePercent');
    expect(res.body).toHaveProperty('totalFailedBacklog');
    expect(Array.isArray(res.body.queues)).toBe(true);
    expect(res.body.queues.length).toBe(10);
  });
});
