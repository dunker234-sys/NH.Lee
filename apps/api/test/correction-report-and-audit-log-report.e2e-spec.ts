import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from '../src/modules/recalculation/queue.constants';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from '../src/modules/notifications/queue.constants';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadCorrectionPolicyConfigFixture } from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('정정/감사로그 조회 리포트 (STEP8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let recalcQueue: Queue<RecalculationJobData>;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadCorrectionPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    recalcQueue = app.get<Queue<RecalculationJobData>>(getQueueToken(RECALCULATION_QUEUE_NAME));
    notificationsQueue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
  }, 60000);

  afterAll(async () => {
    await recalcQueue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  it('사업장별 필터가 다른 사업장 근로자의 정정 신청을 감춘다', async () => {
    await prisma.correctionRequest.create({
      data: {
        employeeId: fixture.employees.plainEmployeeA.id,
        targetWorkDate: new Date('2026-09-01T00:00:00.000Z'),
        reasonCode: 'OTHER',
        reasonDetail: '리포트 테스트 A',
        afterValue: { note: 'a' },
      },
    });
    await prisma.correctionRequest.create({
      data: {
        employeeId: fixture.employees.siteManagerB.id,
        targetWorkDate: new Date('2026-09-01T00:00:00.000Z'),
        reasonCode: 'OTHER',
        reasonDetail: '리포트 테스트 B',
        afterValue: { note: 'b' },
      },
    });

    const { accessToken: managerAToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-report-mgr-a');
    const resA = await request(app.getHttpServer()).get('/admin/correction/report').set(auth(managerAToken));
    expect(resA.status).toBe(200);
    expect(resA.body.every((r: { employeeId: string }) => r.employeeId === fixture.employees.plainEmployeeA.id)).toBe(true);

    const forbidden = await request(app.getHttpServer())
      .get(`/admin/correction/report?siteId=${fixture.siteB.id}`)
      .set(auth(managerAToken));
    expect(forbidden.status).toBe(403);

    const { accessToken: hqToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-report-hq');
    const resAll = await request(app.getHttpServer()).get('/admin/correction/report').set(auth(hqToken));
    expect(resAll.status).toBe(200);
    expect(resAll.body.length).toBeGreaterThanOrEqual(2);
  });

  it('requestSource=ADMIN_DIRECT 필터가 직권 정정 전량 추적 리포트 역할을 한다', async () => {
    const { accessToken: adminToken } = await login(app, fixture.employees.admin.employeeNo, fixture.password, 'dev-report-admin-direct');
    await request(app.getHttpServer())
      .post('/admin/correction/admin-direct')
      .set(auth(adminToken))
      .send({
        employeeId: fixture.employees.plainEmployeeA.id,
        targetWorkDate: '2026-09-06',
        reasonCode: 'OTHER',
        reasonDetail: '전량 추적 리포트 테스트',
        afterValue: { note: 'admin' },
      });

    const { accessToken: hqToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-report-admin-direct-2');
    const res = await request(app.getHttpServer())
      .get('/admin/correction/report?requestSource=ADMIN_DIRECT')
      .set(auth(hqToken));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((r: { requestSource: string }) => r.requestSource === 'ADMIN_DIRECT')).toBe(true);
  });

  it('감사로그 조회는 2026-09 수정사항으로 ADMIN 전용이며, ADMIN은 siteId 없이도 전체를 볼 수 있다', async () => {
    const { accessToken: employeeToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-audit-report-emp');
    await request(app.getHttpServer())
      .post('/me/correction-requests')
      .set(auth(employeeToken))
      .send({
        targetWorkDate: '2026-09-07',
        reasonCode: 'OTHER',
        reasonDetail: '감사로그 조회 테스트',
        afterValue: { note: 'x' },
      });

    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-12-31T23:59:59.000Z';

    const { accessToken: managerAToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-audit-report-mgr');
    const roleDenied = await request(app.getHttpServer())
      .get(`/admin/audit/log?from=${from}&to=${to}&siteId=${fixture.siteA.id}`)
      .set(auth(managerAToken));
    expect(roleDenied.status).toBe(403);
    expect(roleDenied.body.code).toBe('ROLE_DENIED');

    const { accessToken: adminToken } = await login(app, fixture.employees.admin.employeeNo, fixture.password, 'dev-audit-report-admin');
    const withoutSiteId = await request(app.getHttpServer())
      .get(`/admin/audit/log?from=${from}&to=${to}`)
      .set(auth(adminToken));
    expect(withoutSiteId.status).toBe(200);
    expect(withoutSiteId.body.some((r: { eventType: string; subjectEmployeeId: string }) => r.eventType === 'CORRECTION_REQUESTED' && r.subjectEmployeeId === fixture.employees.plainEmployeeA.id)).toBe(true);
  });

  it('감사로그 엑셀 내보내기가 xlsx 바이너리를 반환한다', async () => {
    const { accessToken: adminToken } = await login(app, fixture.employees.admin.employeeNo, fixture.password, 'dev-audit-export');
    const res = await request(app.getHttpServer())
      .get('/admin/audit/log/export?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z')
      .set(auth(adminToken))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });
});
