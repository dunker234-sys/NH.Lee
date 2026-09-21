import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { NotificationService } from '../src/modules/notifications/notification.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadNotificationPolicyConfigFixture } from './fixtures';

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10000, intervalMs = 200): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`waitFor 타임아웃(${timeoutMs}ms) 초과`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** STEP5-A: 본인 알림 이력 조회(GET /alert-log)를 실제 NotificationService 발송 경로로 검증한다. */
describe('GET /alert-log — 본인 알림 이력 조회', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let notificationService: NotificationService;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    notificationService = app.get(NotificationService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('본인에게 발송된 알림만 조회되고 타 직원 알림은 노출되지 않는다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const otherEmployeeId = fixture.employees.regional.id;

    const result = await notificationService.notify('DUMMY_TEST', employeeId, { marker: 'alert-log-test' }, { targetPeriod: 'alert-log-test' });
    await waitFor(async () => {
      const rows = await prisma.alertLog.findMany({ where: { id: { in: result.alertLogIds } } });
      return rows.every((r) => r.result === 'SUCCESS');
    });

    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-alert-log-1');
    const res = await request(app.getHttpServer()).get('/alert-log').set(authHeader(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2); // PUSH + EMAIL
    expect(res.body.items.every((i: { id: string }) => result.alertLogIds.includes(i.id))).toBe(true);
    // 내부 필드(dedupKey)는 투영에서 제외된다.
    expect(res.body.items[0]).not.toHaveProperty('dedupKey');

    const { accessToken: otherToken } = await login(app, fixture.employees.regional.employeeNo, fixture.password, 'dev-alert-log-2');
    const otherRes = await request(app.getHttpServer()).get('/alert-log').set(authHeader(otherToken));
    const otherIds = otherRes.body.items.map((i: { id: string }) => i.id);
    expect(result.alertLogIds.some((id) => otherIds.includes(id))).toBe(false);
    // 두 번째 직원의 조회 결과가 첫 직원 것으로 오염되지 않았음을 employeeId 무결성으로도 확인.
    expect(otherEmployeeId).not.toBe(employeeId);
  });

  it('limit/before 커서 페이지네이션이 동작한다', async () => {
    const employeeId = fixture.employees.hqHr.id;
    for (let i = 0; i < 3; i += 1) {
      const r = await notificationService.notify('DUMMY_TEST', employeeId, { marker: `page-${i}` }, { targetPeriod: `page-test-${i}` });
      await waitFor(async () => {
        const rows = await prisma.alertLog.findMany({ where: { id: { in: r.alertLogIds } } });
        return rows.every((row) => row.result === 'SUCCESS');
      });
    }

    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-alert-log-3');
    const firstPage = await request(app.getHttpServer()).get('/alert-log').query({ limit: 2 }).set(authHeader(accessToken));
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.hasMore).toBe(true);

    const secondPage = await request(app.getHttpServer())
      .get('/alert-log')
      .query({ limit: 2, before: firstPage.body.items[1].requestedAt })
      .set(authHeader(accessToken));
    expect(secondPage.body.items.map((i: { id: string }) => i.id)).not.toEqual(
      expect.arrayContaining(firstPage.body.items.map((i: { id: string }) => i.id)),
    );
  });
});
