import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DummyEmailSender } from '../src/modules/notifications/channels/email.sender';
import { InAppSender } from '../src/modules/notifications/channels/in-app.sender';
import { DummyPushSender } from '../src/modules/notifications/channels/push.sender';
import { NotificationService } from '../src/modules/notifications/notification.service';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from '../src/modules/notifications/queue.constants';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import { Fixture, loadFixture, loadNotificationPolicyConfigFixture } from './fixtures';

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10000, intervalMs = 200): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`waitFor 타임아웃(${timeoutMs}ms) 초과`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

const SETTLED: string[] = ['SUCCESS', 'FAILED_FINAL', 'SUPPRESSED'];

/** STEP4.5 완료조건 3개 + 동의/조용시간/다국어를 실제 Postgres+Redis로 검증한다. */
describe('NotificationService — 알림 발송 인프라', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let notificationService: NotificationService;
  let pushSender: DummyPushSender;
  let emailSender: DummyEmailSender;
  let inAppSender: InAppSender;
  let queue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    notificationService = app.get(NotificationService);
    pushSender = app.get(DummyPushSender);
    emailSender = app.get(DummyEmailSender);
    inAppSender = app.get(InAppSender);
    queue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
  }, 60000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await app.close();
  });

  async function findLogs(ids: string[]) {
    return prisma.alertLog.findMany({ where: { id: { in: ids } } });
  }

  // ---------------------------------------------------------------------
  // 완료조건1: 더미 알림이 push/email 두 채널로 발송되고 alert_log에 기록된다
  // ---------------------------------------------------------------------
  it('더미 알림이 PUSH·EMAIL 두 채널로 발송되고 alert_log에 기록된다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const result = await notificationService.notify('DUMMY_TEST', employeeId, { marker: 'basic' });

    expect(result.alertLogIds).toHaveLength(2);
    await waitFor(async () => {
      const rows = await findLogs(result.alertLogIds);
      return rows.every((r) => r.result === 'SUCCESS');
    });

    const rows = await findLogs(result.alertLogIds);
    const push = rows.find((r) => r.channel === 'PUSH');
    const email = rows.find((r) => r.channel === 'EMAIL');
    expect(push?.sentAt).toBeTruthy();
    expect(email?.sentAt).toBeTruthy();
    expect(push?.dedupKey).not.toBe(email?.dedupKey);
  });

  // ---------------------------------------------------------------------
  // 완료조건2: 동일 알림을 2회 요청해도 1회만 발송된다(동시 요청으로 경쟁조건 증명)
  // ---------------------------------------------------------------------
  it('동일 알림을 동시에 2번 요청해도 채널당 1건만 저장·발송된다', async () => {
    const employeeId = fixture.employees.regional.id;
    const options = { targetPeriod: '2026-01', stage: 'DUP_TEST' };

    const [r1, r2] = await Promise.all([
      notificationService.notify('DUMMY_TEST', employeeId, { marker: 'dup' }, options),
      notificationService.notify('DUMMY_TEST', employeeId, { marker: 'dup' }, options),
    ]);

    const allIds = [...new Set([...r1.alertLogIds, ...r2.alertLogIds])];
    expect(allIds).toHaveLength(2); // PUSH 1개 + EMAIL 1개, 4개 아님
    expect(r1.alertLogIds.slice().sort()).toEqual(r2.alertLogIds.slice().sort());

    await waitFor(async () => {
      const rows = await findLogs(allIds);
      return rows.every((r) => SETTLED.includes(r.result));
    });

    const rows = await prisma.alertLog.findMany({
      where: { recipientEmployeeId: employeeId, notificationType: 'DUMMY_TEST', targetPeriod: '2026-01', stage: 'DUP_TEST' },
    });
    expect(rows).toHaveLength(2);
  });

  // ---------------------------------------------------------------------
  // 완료조건3: 발송 실패 시 재시도되고, 최종 실패는 DLQ(BullMQ failed 목록)에 남는다
  // ---------------------------------------------------------------------
  it('발송 실패는 재시도되고, 최종 실패는 DLQ에 남는다', async () => {
    const employeeId = fixture.employees.hqHr.id;
    const result = await notificationService.notify(
      'DUMMY_TEST',
      employeeId,
      { marker: 'fail', forceFail: true },
      { targetPeriod: 'fail-test' },
    );

    await waitFor(async () => {
      const rows = await findLogs(result.alertLogIds);
      return rows.every((r) => r.result === 'FAILED_FINAL');
    }, 20000);

    const rows = await findLogs(result.alertLogIds);
    rows.forEach((r) => expect(r.retryCount).toBeGreaterThanOrEqual(3));

    const failed = await queue.getFailed();
    const failedIds = new Set(failed.map((j) => j.id));
    result.alertLogIds.forEach((id) => expect(failedIds.has(id)).toBe(true));
  }, 25000);

  // ---------------------------------------------------------------------
  // 알림 수신 동의 철회 → 전 채널 억제
  // ---------------------------------------------------------------------
  it('알림 수신 동의를 철회하면 발송기를 호출하지 않고 SUPPRESSED로 기록된다', async () => {
    const employeeId = fixture.employees.siteManagerA.id;
    await adminPrisma.consent.create({
      data: { employeeId, consentType: 'NOTIFICATION', status: 'WITHDRAWN', policyVersion: 'v1', withdrawnAt: new Date() },
    });

    const pushBefore = pushSender.callCount;
    const emailBefore = emailSender.callCount;
    const result = await notificationService.notify('DUMMY_TEST', employeeId, { marker: 'consent' }, { targetPeriod: 'consent-test' });

    await waitFor(async () => {
      const rows = await findLogs(result.alertLogIds);
      return rows.every((r) => r.result === 'SUPPRESSED');
    });

    expect(pushSender.callCount).toBe(pushBefore);
    expect(emailSender.callCount).toBe(emailBefore);
  });

  // ---------------------------------------------------------------------
  // 조용시간 억제(PUSH만) + urgent 예외
  // ---------------------------------------------------------------------
  it('조용시간에는 PUSH만 억제되고, urgent 유형은 조용시간에도 발송된다', async () => {
    // siteManagerB(siteB) 전용 — siteA 직원을 쓰는 다른 테스트를 오염시키지 않는다.
    const employeeId = fixture.employees.siteManagerB.id;
    const siteId = fixture.siteB.id;

    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const nowMinute = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
    const start = (nowMinute - 60 + 1440) % 1440;
    const end = (nowMinute + 60) % 1440;
    await adminPrisma.policyConfig.create({
      data: { key: 'notification_quiet_hours_start_minute_of_day', value: start as never, siteId, effectiveStartDate: new Date('2026-01-01') },
    });
    await adminPrisma.policyConfig.create({
      data: { key: 'notification_quiet_hours_end_minute_of_day', value: end as never, siteId, effectiveStartDate: new Date('2026-01-01') },
    });

    const result = await notificationService.notify('DUMMY_TEST', employeeId, { marker: 'quiet' }, { targetPeriod: 'quiet-test' });
    await waitFor(async () => {
      const rows = await findLogs(result.alertLogIds);
      return rows.every((r) => SETTLED.includes(r.result));
    });
    const rows = await findLogs(result.alertLogIds);
    expect(rows.find((r) => r.channel === 'PUSH')?.result).toBe('SUPPRESSED');
    expect(rows.find((r) => r.channel === 'EMAIL')?.result).toBe('SUCCESS');

    const urgentResult = await notificationService.notify(
      'DUMMY_URGENT_TEST',
      employeeId,
      { marker: 'quiet-urgent' },
      { targetPeriod: 'quiet-urgent-test' },
    );
    await waitFor(async () => {
      const urgentRows = await findLogs(urgentResult.alertLogIds);
      return urgentRows.every((r) => SETTLED.includes(r.result));
    });
    const urgentRows = await findLogs(urgentResult.alertLogIds);
    expect(urgentRows).toHaveLength(1); // DUMMY_URGENT_TEST는 PUSH만
    expect(urgentRows[0].result).toBe('SUCCESS');
  });

  // ---------------------------------------------------------------------
  // en/vi 템플릿이 없으면 예외 없이 ko로 폴백한다
  // ---------------------------------------------------------------------
  it('직원 로케일에 해당하는 템플릿이 없으면 예외 없이 ko로 폴백해 발송된다', async () => {
    const employeeId = fixture.employees.hqHr.id;
    await adminPrisma.employee.update({ where: { id: employeeId }, data: { locale: 'en' } });

    const result = await notificationService.notify('DUMMY_TEST', employeeId, { marker: 'locale' }, { targetPeriod: 'locale-test' });
    await waitFor(async () => {
      const rows = await findLogs(result.alertLogIds);
      return rows.every((r) => r.result === 'SUCCESS');
    });

    const rows = await findLogs(result.alertLogIds);
    rows.forEach((r) => expect(r.locale).toBe('en')); // 요청 시점 선호 로케일 스냅샷
  });

  it('in-app 채널은 alert_log 행 자체가 배너 레코드다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const result = await notificationService.notify(
      'DUMMY_TEST',
      employeeId,
      { marker: 'in-app' },
      { targetPeriod: 'in-app-test', channels: ['IN_APP'] },
    );
    await waitFor(async () => {
      const rows = await findLogs(result.alertLogIds);
      return rows.every((r) => r.result === 'SUCCESS');
    });
    expect(inAppSender.callCount).toBeGreaterThan(0);
  });
});
