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
import { Fixture, loadFixture, loadPolicyConfigFixture, loadNotificationPolicyConfigFixture } from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** 요구사항서4.3 §2: 보상휴가(§57)는 근로자대표 서면합의가 등록된 경우에만
 * 활성화되고, 가산율을 반영해 환산한다(연장 1h→1.5h). */
describe('보상휴가(§57) 전환', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let recalcQueue: Queue<RecalculationJobData>;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    recalcQueue = app.get<Queue<RecalculationJobData>>(getQueueToken(RECALCULATION_QUEUE_NAME));
    notificationsQueue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
    await prisma.leaveType.create({
      data: { code: 'COMPENSATORY', name: '보상휴가', category: 'COMPENSATORY', paid: true, deductionUnit: 'HOUR' },
    });
  }, 60000);

  afterAll(async () => {
    await recalcQueue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  async function createApprovedOvertime(employeeId: string, targetDate: string, expectedMinutes: number) {
    return prisma.overtimeRequest.create({
      data: { employeeId, requestType: 'POST', targetDate: new Date(`${targetDate}T00:00:00.000Z`), expectedMinutes, reason: '테스트', status: 'APPROVED' },
    });
  }

  it('근로자대표 서면합의 없이 전환을 시도하면 400으로 거부된다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const overtime = await createApprovedOvertime(employeeId, '2026-09-20', 60);
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-comp-noagreement');

    const res = await request(app.getHttpServer())
      .post('/admin/leave/compensatory/convert')
      .set(auth(accessToken))
      .send({ employeeId, sourceOvertimeRequestId: overtime.id, sourceCategory: 'OVERTIME' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMPENSATORY_LEAVE_AGREEMENT_MISSING');
  });

  it('서면합의가 있으면 가산율(0.5) 반영해 60분→90분으로 전환되고, 같은 건 재전환은 거부된다', async () => {
    await prisma.laborAgreement.create({
      data: {
        siteId: fixture.siteA.id,
        agreementType: 'COMPENSATORY_LEAVE',
        effectiveStartDate: new Date('2026-01-01T00:00:00.000Z'),
        documentReference: '2026년 보상휴가 서면합의서',
        signedDate: new Date('2026-01-01T00:00:00.000Z'),
        representativeName: '근로자대표 홍길동',
      },
    });

    const employeeId = fixture.employees.plainEmployeeA.id;
    const overtime = await createApprovedOvertime(employeeId, '2026-09-21', 60);
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-comp-convert');

    const res = await request(app.getHttpServer())
      .post('/admin/leave/compensatory/convert')
      .set(auth(accessToken))
      .send({ employeeId, sourceOvertimeRequestId: overtime.id, sourceCategory: 'OVERTIME' });
    expect(res.status).toBe(201);
    expect(res.body.compensatoryLeaveMinutes).toBe(90);
    expect(res.body.appliedPremiumRate).toBe('0.5');

    const again = await request(app.getHttpServer())
      .post('/admin/leave/compensatory/convert')
      .set(auth(accessToken))
      .send({ employeeId, sourceOvertimeRequestId: overtime.id, sourceCategory: 'OVERTIME' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('COMPENSATORY_LEAVE_ALREADY_CONVERTED');
  });
});
