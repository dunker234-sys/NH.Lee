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
import { Fixture, loadFixture, loadPolicyConfigFixture, loadLeavePolicyConfigFixture } from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function dateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * 완료조건4: 촉진 절차 1단계를 누락한 근로자가 "보상의무 있음"으로
 * 판정된다.
 */
describe('연차 사용 촉진 절차 준수 판정', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let leaveTypeId: string;
  let recalcQueue: Queue<RecalculationJobData>;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadLeavePolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    recalcQueue = app.get<Queue<RecalculationJobData>>(getQueueToken(RECALCULATION_QUEUE_NAME));
    notificationsQueue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
    const leaveType = await prisma.leaveType.create({
      data: { code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' },
    });
    leaveTypeId = leaveType.id;
  }, 60000);

  afterAll(async () => {
    await recalcQueue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  it('★ 1단계(1차 촉구) 로그가 아예 없으면 "보상의무 있음"으로 판정된다', async () => {
    const balance = await prisma.leaveBalance.create({
      data: {
        employeeId: fixture.employees.plainEmployeeA.id,
        leaveTypeId,
        referencePeriod: '2026-08-01',
        effectiveDate: dateOnly('2026-08-01'),
        expiryDate: dateOnly('2027-01-31'),
        grantedDays: 15,
        basis: { reasonCode: 'FULL_YEAR_GRANT' },
      },
    });

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-promo-compliance-1');
    const res = await request(app.getHttpServer())
      .get(`/admin/leave/promotion/compliance?leaveBalanceId=${balance.id}`)
      .set(auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.compensationObligationExists).toBe(true);
    expect(res.body.failedRequirements).toContain('FIRST_NOTICE_MISSING_OR_LATE');
  });

  it('대조군: 1차 촉구 후 근로자가 기간 내 응답하면 보상의무가 없다고 판정된다', async () => {
    const balance = await prisma.leaveBalance.create({
      data: {
        employeeId: fixture.employees.plainEmployeeA.id,
        leaveTypeId,
        referencePeriod: '2026-08-02',
        effectiveDate: dateOnly('2026-08-02'),
        expiryDate: dateOnly('2027-01-31'),
        grantedDays: 15,
        basis: { reasonCode: 'FULL_YEAR_GRANT' },
      },
    });

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-promo-compliance-2');

    // 소멸(2027-01-31) 6개월 전(2026-07-31)부터 10일 창 안 — asOfDate=2026-08-01.
    const runRes = await request(app.getHttpServer())
      .post('/admin/leave/promotion/run')
      .set(auth(accessToken))
      .send({ asOfDate: '2026-08-01', siteId: fixture.siteA.id });
    expect(runRes.status).toBe(201);

    const firstNoticeLog = await prisma.leavePromotionLog.findFirstOrThrow({
      where: { leaveBalanceId: balance.id, procedureType: 'ARTICLE_61_1', step: 'FIRST_NOTICE' },
    });

    const responseRes = await request(app.getHttpServer())
      .post(`/admin/leave/promotion/${firstNoticeLog.id}/record-response`)
      .set(auth(accessToken))
      .send({ receivedAt: '2026-08-05', specifiedUsageDates: true });
    expect(responseRes.status).toBe(201);

    const complianceRes = await request(app.getHttpServer())
      .get(`/admin/leave/promotion/compliance?leaveBalanceId=${balance.id}`)
      .set(auth(accessToken));
    expect(complianceRes.body.compensationObligationExists).toBe(false);
    expect(complianceRes.body.failedRequirements).toEqual([]);
  });
});
