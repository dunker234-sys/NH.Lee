import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from '../src/modules/recalculation/queue.constants';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from '../src/modules/notifications/queue.constants';
import { createTestApp } from './setup/app';
import { recentWorkDate } from './setup/dates';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadCorrectionPolicyConfigFixture } from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * ROADMAP STEP8 §범위경계: 재마감(마감취소→재마감) 전체 사이클은 STEP11
 * 소관이다 — STEP8은 "마감된 월엔 정정을 반영할 수 없고, 반영하려면 재마감이
 * 필요하다"는 사실을 신청·승인 두 시점 모두에서 명확히 차단하는 데까지만
 * 한다. 마감(CLOSED) 상태는 아직 STEP11 마감 API가 없어 여기서는 PayrollClose
 * 행을 직접 만들어 재현한다(STEP7.5 개시 데이터 이관이 실제로 하는 것과
 * 동일한 방식 — 그 경로가 오늘 CLOSED 행이 생기는 유일한 실제 경로다).
 */
describe('마감된 월의 정정 차단 (STEP8)', () => {
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
    // 정정 신청 자체가 결재선 대상에게 알림 잡을 큐에 올린다 — 다음 e2e 파일이
    // 같은 앱을 새로 띄웠을 때 이 잔여 잡을 주워 처리하다 alert_log 행이 이미
    // TRUNCATE된 상태와 부딪히는 사고를 막는다(직접 겪음).
    await recalcQueue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  it('마감된 월에 대한 정정 신청은 400 CORRECTION_TARGET_PERIOD_CLOSED로 거부된다', async () => {
    await prisma.payrollClose.create({
      data: { siteId: fixture.siteA.id, periodYearMonth: '2026-08', status: 'CLOSED', closedAt: new Date(), closedBy: fixture.employees.hqHr.id },
    });

    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-correction-closed');
    const res = await request(app.getHttpServer())
      .post('/me/correction-requests')
      .set(auth(accessToken))
      .send({
        targetWorkDate: '2026-08-15',
        reasonCode: 'OTHER',
        reasonDetail: '마감월 정정 시도',
        afterValue: { note: 'x' },
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CORRECTION_TARGET_PERIOD_CLOSED');
  });

  it('신청 시점엔 열려 있었지만 승인 시점에 마감된 경우 승인이 거부된다', async () => {
    const raceWorkDate = recentWorkDate(5);
    const { accessToken: employeeToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-correction-close-race');
    const submitRes = await request(app.getHttpServer())
      .post('/me/correction-requests')
      .set(auth(employeeToken))
      .send({
        targetWorkDate: raceWorkDate,
        reasonCode: 'OTHER',
        reasonDetail: '신청 후 마감되는 경쟁 상황 재현',
        afterValue: { note: 'x' },
      });
    expect(submitRes.status).toBe(201);

    // 신청 이후, 승인 전에 그 사업장·그 달이 마감됐다고 가정한다.
    await prisma.payrollClose.create({
      data: { siteId: fixture.siteA.id, periodYearMonth: raceWorkDate.slice(0, 7), status: 'CLOSED', closedAt: new Date(), closedBy: fixture.employees.hqHr.id },
    });

    const { accessToken: managerToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-correction-close-race-mgr');
    const approveRes = await request(app.getHttpServer())
      .post(`/admin/correction/requests/${submitRes.body.id}/approve`)
      .set(auth(managerToken))
      .send({ expectedVersion: 1 });

    expect(approveRes.status).toBe(400);
    expect(approveRes.body.code).toBe('CORRECTION_TARGET_PERIOD_CLOSED');

    const stillPending = await prisma.correctionRequest.findUniqueOrThrow({ where: { id: submitRes.body.id } });
    expect(stillPending.status).toBe('PENDING');
  });
});
