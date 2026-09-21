import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from '../src/modules/notifications/queue.constants';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import {
  Fixture,
  loadFixture,
  loadPolicyConfigFixture,
  loadPunchPolicyConfigFixture,
  loadNotificationPolicyConfigFixture,
} from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * 완료조건3: 외근 승인이 있는 상태에서 사업장 반경 밖 타각이 정상
 * 처리된다. GeofenceService.evaluate()의 승인된 DispatchRequest 예외
 * 자체는 이미 구현돼 있었다(STEP4) — 이 테스트는 신규 승인 API(사후
 * 신청 → 관리자 승인)와 그 기존 로직의 조합을 증명한다.
 */
describe('외근/지원 승인 → 지오펜스 예외', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPunchPolicyConfigFixture();
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    notificationsQueue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
  }, 60000);

  afterAll(async () => {
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  const OUTSIDE_LOCATION = (lat: number, lng: number) => ({ lat: lat + 0.005, lng, accuracyM: 10 }); // 약 500m 밖(반경 100m)

  it('사후 신청 → 관리자 승인 후, 그 기간 내 반경 밖 타각이 지오펜스 플래그 없이 저장된다', async () => {
    const { accessToken: employeeToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-dispatch-geo-1');

    const createRes = await request(app.getHttpServer())
      .post('/me/dispatch-requests')
      .set(auth(employeeToken))
      .send({
        dispatchType: 'BUSINESS_TRIP',
        targetSiteId: fixture.siteB.id,
        startDate: '2026-09-20',
        endDate: '2026-09-22',
        reason: '거래처 긴급 방문 지원(사후 신청)',
        isPostHoc: true,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('PENDING');

    const { accessToken: managerToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-dispatch-geo-mgr');
    const approveRes = await request(app.getHttpServer())
      .post(`/admin/approval/dispatch-requests/${createRes.body.id}/approve`)
      .set(auth(managerToken))
      .send({ expectedVersion: 1 });
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.status).toBe('APPROVED');

    const punchRes = await request(app.getHttpServer())
      .post('/punches')
      .set(auth(employeeToken))
      .send({
        punchType: 'IN',
        recordedAt: '2026-09-20T09:00:00+09:00',
        siteId: fixture.siteA.id,
        location: OUTSIDE_LOCATION(fixture.siteA.lat, fixture.siteA.lng),
        registrationMethod: 'GPS',
        deviceId: 'dev-dispatch-geo-1',
        clientEventId: 'client-dispatch-geo-1',
      });
    expect([200, 201]).toContain(punchRes.status);
    expect(punchRes.body.integrityFlags).not.toEqual(expect.arrayContaining(['OUT_OF_GEOFENCE_NO_DISPATCH', 'OUT_OF_GEOFENCE_NO_DISPATCH_NO_REASON']));

    const row = await prisma.punchRaw.findUniqueOrThrow({ where: { id: punchRes.body.punchId } });
    expect(row.integrityFlags).not.toEqual(expect.arrayContaining(['OUT_OF_GEOFENCE_NO_DISPATCH']));
  });

  it('대조군: 승인 없는 상태에서 같은 좌표로 찍으면 여전히 지오펜스 플래그가 붙는다(회귀 방지)', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-dispatch-geo-2');

    const punchRes = await request(app.getHttpServer())
      .post('/punches')
      .set(auth(accessToken))
      .send({
        punchType: 'IN',
        recordedAt: '2026-09-25T09:00:00+09:00',
        siteId: fixture.siteA.id,
        location: OUTSIDE_LOCATION(fixture.siteA.lat, fixture.siteA.lng),
        registrationMethod: 'GPS',
        deviceId: 'dev-dispatch-geo-2',
        clientEventId: 'client-dispatch-geo-2',
      });
    expect([200, 201]).toContain(punchRes.status);
    expect(punchRes.body.integrityFlags).toEqual(expect.arrayContaining(['OUT_OF_GEOFENCE_NO_DISPATCH_NO_REASON']));
  });
});
