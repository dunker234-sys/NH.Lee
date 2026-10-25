import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Queue } from 'bullmq';
import request from 'supertest';
import { RECALCULATION_QUEUE_NAME } from '../src/modules/recalculation/queue.constants';
import { FRAUD_DETECTION_QUEUE_NAME } from '../src/modules/fraud-detection/queue.constants';
import { WEEKLY_ALERT_QUEUE_NAME } from '../src/modules/weekly-alert/queue.constants';
import { NOTIFICATIONS_QUEUE_NAME } from '../src/modules/notifications/queue.constants';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import { loginInChunks } from './setup/auth-helper';
import {
  Fixture,
  loadFixture,
  loadPolicyConfigFixture,
  loadPunchPolicyConfigFixture,
  loadSiteIpAllowlistFixture,
  loadWeeklyAlertPolicyConfigFixture,
} from './fixtures';

const TARGET_PER_MINUTE = 500;
const DURATION_MS = 60000;
const INTERVAL_MS = DURATION_MS / TARGET_PER_MINUTE; // ~120ms — 분당 500건 지속 처리량.

function percentile(sortedMs: number[], p: number): number {
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[idx];
}

async function waitForActiveDrain(queue: Queue, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-await-in-loop
  while ((await queue.getActiveCount()) > 0) {
    if (Date.now() - start > timeoutMs) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * STEP12 완료조건("부하테스트 P95 1초 이내 유지"): 출근 피크(05:30~09:00)
 * 분당 500건 타각을 흉내낸다. 기존 punches-p95.e2e-spec.ts는 100건 **동시
 * 버스트**(순간 최대치)만 측정한다 — 이 스펙은 성격이 다르다: 60초에 걸쳐
 * 약 120ms 간격으로 고르게 분산된 지속 처리량(분당 500건 페이스)에서도
 * P95가 유지되는지를 본다. waitForActiveDrain/큐 obliterate 패턴은
 * punches-p95.e2e-spec.ts에서 그대로 가져왔다(실측으로 검증된, 활성 처리
 * 중인 잡을 obliterate하면 워커가 멈추는 문제의 해결책).
 */
describe('POST /punches — 출근 피크 분당 500건 지속 처리량 (STEP12)', () => {
  let app: INestApplication;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPunchPolicyConfigFixture();
    await loadWeeklyAlertPolicyConfigFixture();
    await loadSiteIpAllowlistFixture(fixture.siteA.id, '127.0.0.1/32', '분당500건 부하테스트 루프백');
    app = await createTestApp();

    const recalcQueue = app.get<Queue>(getQueueToken(RECALCULATION_QUEUE_NAME));
    const fraudQueue = app.get<Queue>(getQueueToken(FRAUD_DETECTION_QUEUE_NAME));
    const weeklyAlertQueue = app.get<Queue>(getQueueToken(WEEKLY_ALERT_QUEUE_NAME));
    await Promise.all([
      recalcQueue.obliterate({ force: true }),
      fraudQueue.obliterate({ force: true }),
      weeklyAlertQueue.obliterate({ force: true }),
    ]);
  }, 120000);

  afterAll(async () => {
    const recalcQueue = app.get<Queue>(getQueueToken(RECALCULATION_QUEUE_NAME));
    const fraudQueue = app.get<Queue>(getQueueToken(FRAUD_DETECTION_QUEUE_NAME));
    const weeklyAlertQueue = app.get<Queue>(getQueueToken(WEEKLY_ALERT_QUEUE_NAME));
    const notificationsQueue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
    await Promise.all([
      waitForActiveDrain(recalcQueue),
      waitForActiveDrain(fraudQueue),
      waitForActiveDrain(weeklyAlertQueue),
      waitForActiveDrain(notificationsQueue),
    ]);
    await Promise.all([
      recalcQueue.obliterate({ force: true }),
      fraudQueue.obliterate({ force: true }),
      weeklyAlertQueue.obliterate({ force: true }),
      notificationsQueue.obliterate({ force: true }),
    ]);
    await app.close();
  }, 60000);

  it(`60초간 분당 ${TARGET_PER_MINUTE}건 페이스로 고르게 분산된 타각의 P95가 1초 이내다`, async () => {
    const password = 'LoadTest!Pass123';
    const passwordHash = await bcrypt.hash(password, 4);

    // 500건을 개별 create()×3으로 만들면(직전 커밋에서 겪음) 순간 동시
    // 요청 수가 테스트 커넥션 풀(연결수가 작은 adminPrisma, migrator
    // connection_limit=5)을 압도해 Prisma 엔진이 죽는다 — id를 미리
    // 만들어 createMany 3번(총 3 round-trip)으로 대량 삽입한다
    // (weekly/monthly-recalc-batch-performance.e2e-spec.ts와 동일한 관례).
    const employees = Array.from({ length: TARGET_PER_MINUTE }).map((_, i) => ({
      id: randomUUID(),
      employeeNo: `T-PEAK-${String(i).padStart(4, '0')}`,
      name: `피크부하-${i}`,
      employmentType: 'REGULAR' as const,
      hireDate: new Date('2024-01-01'),
      primarySiteId: fixture.siteA.id,
    }));
    await adminPrisma.employee.createMany({ data: employees });
    await adminPrisma.employeeCredential.createMany({
      data: employees.map((e) => ({ employeeId: e.id, passwordHash, mustChangePassword: false })),
    });
    await adminPrisma.employeeSiteAssignment.createMany({
      data: employees.map((e) => ({ employeeId: e.id, siteId: fixture.siteA.id, assignmentRole: 'PRIMARY' as const, startDate: new Date('2024-01-01') })),
    });

    // 로그인(=기기 등록)은 측정 구간 밖에서 끝낸다 — punches-p95.e2e-spec.ts와 같은 이유.
    // 500건을 한 번에 동시 발사하면 테스트 커넥션 풀(connection_limit=10)이
    // 감당 못 해 Prisma 엔진이 죽는다(실측으로 확인) — 청크로 나눠 순차 실행한다
    // (청크 크기는 loginInChunks 참고. 2 vCPU CI에서는 100명 동시도 풀 대기를 넘겼다).
    const tokens = await loginInChunks(
      app,
      employees.map((e) => ({ employeeNo: e.employeeNo, password, deviceId: `dev-peak-${e.employeeNo}` })),
    );

    const recordedAt = '2026-06-15T06:00:00+09:00'; // 출근 피크 창(05:30~09:00) 안.
    const durations: number[] = new Array(TARGET_PER_MINUTE);

    const requests = employees.map(
      (e, i) =>
        new Promise<void>((resolve, reject) => {
          setTimeout(async () => {
            try {
              const start = performance.now();
              const res = await request(app.getHttpServer())
                .post('/punches')
                .set('Authorization', `Bearer ${tokens[i].accessToken}`)
                .send({
                  punchType: 'IN',
                  recordedAt,
                  siteId: fixture.siteA.id,
                  registrationMethod: 'PC',
                  deviceId: `dev-peak-${e.employeeNo}`,
                  clientEventId: `peak-evt-${e.employeeNo}`,
                });
              durations[i] = performance.now() - start;
              expect([200, 201]).toContain(res.status);
              resolve();
            } catch (err) {
              reject(err);
            }
          }, i * INTERVAL_MS);
        }),
    );

    await Promise.all(requests);

    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);

    // eslint-disable-next-line no-console
    console.log(
      `[분당500건 부하] n=${sorted.length} min=${sorted[0].toFixed(1)}ms p50=${percentile(sorted, 50).toFixed(1)}ms ` +
        `p95=${p95.toFixed(1)}ms max=${sorted[sorted.length - 1].toFixed(1)}ms`,
    );

    expect(p95).toBeLessThan(1000);
  }, 120000);
});
