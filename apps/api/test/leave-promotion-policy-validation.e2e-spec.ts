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

const STATUTORY_VALUES = {
  article611FirstNoticeWindowDays: 10,
  article611FirstNoticeAnchorMonthsBeforeExpiry: 6,
  article611EmployeeResponseWindowDays: 10,
  article611SecondNoticeDeadlineMonthsBeforeExpiry: 2,
  article612WaveAFirstNoticeWindowDays: 10,
  article612WaveAFirstNoticeAnchorMonthsBefore: 3,
  article612WaveASecondNoticeDeadlineMonthsBefore: 1,
  article612WaveBFirstNoticeWindowDays: 5,
  article612WaveBFirstNoticeAnchorMonthsBefore: 1,
  article612WaveBSecondNoticeDeadlineDaysBefore: 10,
};

/**
 * 완료조건3: 연차 촉진 기한을 법정보다 늦게 설정하려 하면 저장이
 * 거부된다.
 */
describe('연차 사용 촉진 정책 갱신 — 법정 기한보다 늦은 설정 거부', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
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
  }, 60000);

  afterAll(async () => {
    await recalcQueue.obliterate({ force: true });
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  it('2차 통보 리드타임을 법정(2개월)보다 짧게 설정하면 400으로 거부되고 DB에 저장되지 않는다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-promo-policy-1');
    const res = await request(app.getHttpServer())
      .put('/admin/leave/promotion-policy')
      .set(auth(accessToken))
      .send({
        effectiveStartDate: '2026-09-01',
        values: { ...STATUTORY_VALUES, article611SecondNoticeDeadlineMonthsBeforeExpiry: 1 },
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LEAVE_PROMOTION_POLICY_STATUTORY_VIOLATION');
    expect(res.body.details.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'article611SecondNoticeDeadlineMonthsBeforeExpiry' })]),
    );

    const rows = await prisma.policyConfig.findMany({
      where: { key: 'article611SecondNoticeDeadlineMonthsBeforeExpiry', effectiveStartDate: new Date('2026-09-01T00:00:00.000Z') },
    });
    expect(rows).toHaveLength(0);
  });

  it('1차 촉구 가능 기간을 법정(10일)보다 길게 설정해도 거부된다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-promo-policy-2');
    const res = await request(app.getHttpServer())
      .put('/admin/leave/promotion-policy')
      .set(auth(accessToken))
      .send({
        effectiveStartDate: '2026-09-02',
        values: { ...STATUTORY_VALUES, article611FirstNoticeWindowDays: 15 },
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LEAVE_PROMOTION_POLICY_STATUTORY_VIOLATION');
  });

  it('법정값 그대로 또는 더 엄격한 값은 저장이 허용된다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-promo-policy-3');
    const exact = await request(app.getHttpServer())
      .put('/admin/leave/promotion-policy')
      .set(auth(accessToken))
      .send({ effectiveStartDate: '2026-09-03', values: STATUTORY_VALUES });
    expect(exact.status).toBe(200);

    const stricter = await request(app.getHttpServer())
      .put('/admin/leave/promotion-policy')
      .set(auth(accessToken))
      .send({
        effectiveStartDate: '2026-09-04',
        values: { ...STATUTORY_VALUES, article611FirstNoticeAnchorMonthsBeforeExpiry: 7, article611FirstNoticeWindowDays: 5 },
      });
    expect(stricter.status).toBe(200);

    const rows = await prisma.policyConfig.findMany({
      where: { key: 'article611FirstNoticeAnchorMonthsBeforeExpiry', effectiveStartDate: new Date('2026-09-04T00:00:00.000Z') },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(7);
  });
});
