import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Queue } from 'bullmq';
import request from 'supertest';
import { FRAUD_DETECTION_QUEUE_NAME } from '../src/modules/fraud-detection/queue.constants';
import { RECALCULATION_QUEUE_NAME } from '../src/modules/recalculation/queue.constants';
import { WEEKLY_RECALC_BATCH_QUEUE_NAME } from '../src/modules/recalculation/weekly-recalc-batch.queue.constants';
import { WEEKLY_ALERT_QUEUE_NAME } from '../src/modules/weekly-alert/queue.constants';
import { HR_SYNC_QUEUE_NAME } from '../src/modules/hr-sync/queue.constants';
import { NOTIFICATIONS_QUEUE_NAME } from '../src/modules/notifications/queue.constants';
import { createTestApp } from './setup/app';
import { resetDatabase, adminPrisma } from './setup/db';
import { loginInChunks } from './setup/auth-helper';
import {
  Fixture,
  loadFixture,
  loadPolicyConfigFixture,
  loadPunchPolicyConfigFixture,
  loadSiteIpAllowlistFixture,
  loadWeeklyAlertPolicyConfigFixture,
} from './fixtures';

const CONCURRENT_REQUESTS = 100;

function percentile(sortedMs: number[], p: number): number {
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[idx];
}

/** 완료조건: 타각 API P95 1초 이내(100건 동시 요청 기준). */
describe('POST /punches — P95 부하 테스트', () => {
  let app: INestApplication;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPunchPolicyConfigFixture();
    // STEP9: 재계산 잡마다 52시간 알림 평가가 뒤따른다(WeeklyAlertModule) — 이
    // 정책값이 없으면 매 잡이 실패→재시도(3회, 지수 백오프)를 반복해 커넥션
    // 풀(connection_limit=10)을 불필요하게 잡아먹고 P95를 흔든다(실측으로 확인).
    await loadWeeklyAlertPolicyConfigFixture();
    // STEP5-B: registrationMethod:'PC'는 IpAllowlistGuard의 대상이라 fail-closed
    // 기본값 때문에 허용목록이 없으면 전부 403이 된다 — 이 스펙은 IP 정책이
    // 아니라 순수 처리량을 재므로 테스트 클라이언트의 실제 소켓 주소(127.0.0.1,
    // supertest는 ::ffff:127.0.0.1로 접속함)를 명시적으로 허용해 둔다.
    await loadSiteIpAllowlistFixture(fixture.siteA.id, '127.0.0.1/32', 'P95 테스트 루프백');
    app = await createTestApp();

    // Redis는 resetDatabase()가 건드리지 않는다 — 이전 스펙 파일들이 남긴
    // 큐 잔량이 이 부하 테스트의 측정치에 섞이지 않도록 시작 전에 비운다.
    // (아직 아무 잡도 활성 처리 중이 아니므로 lock 갱신과 경합하지 않는다.)
    // STEP9: weekly-alert/weekly-recalc-batch 큐도 같은 이유로 비운다 — 이전
    // 스펙이 남긴 잔량이 이번 측정에 섞이면 P95가 실제보다 나쁘게 나온다
    // (실측으로 확인: 잔량이 있으면 2000ms대까지 치솟는다).
    const recalcQueue = app.get<Queue>(getQueueToken(RECALCULATION_QUEUE_NAME));
    const fraudQueue = app.get<Queue>(getQueueToken(FRAUD_DETECTION_QUEUE_NAME));
    const weeklyAlertQueue = app.get<Queue>(getQueueToken(WEEKLY_ALERT_QUEUE_NAME));
    const weeklyRecalcBatchQueue = app.get<Queue>(getQueueToken(WEEKLY_RECALC_BATCH_QUEUE_NAME));
    // STEP10: hr-sync 큐는 이 스펙의 부하와 무관하지만(매일 새벽 repeat 잡
    // 하나뿐), createTestApp()이 만드는 모든 큐를 일관되게 비워 둔다.
    const hrSyncQueue = app.get<Queue>(getQueueToken(HR_SYNC_QUEUE_NAME));
    await Promise.all([
      recalcQueue.obliterate({ force: true }),
      fraudQueue.obliterate({ force: true }),
      weeklyAlertQueue.obliterate({ force: true }),
      weeklyRecalcBatchQueue.obliterate({ force: true }),
      hrSyncQueue.obliterate({ force: true }),
    ]);
  }, 120000); // STEP9: 큐가 5개 늘어(WeeklyAlertModule/WeeklyRecalcBatch) createTestApp() 자체가 더 걸린다 — 60s로는 부족했다(실측).

  afterAll(async () => {
    // 100건의 타각이 재계산/부정사용탐지 큐에 최대 200개 잡을 남긴다 — 이 스펙은
    // 그 처리 결과를 검증하지 않는다. app.close()는 BullMQ Worker의 정상 종료
    // 절차(진행 중인 잡만 기다리고 대기열 잔량은 기다리지 않음)를 그대로 따르게
    // 둔다 — obliterate를 여기서 같이 하면 활성 잡의 lock 갱신과 경합해 노이즈성
    // 에러가 난다(직접 겪은 문제).
    // STEP9: 재계산 잡마다 weekly-alert 큐에도 잡이 하나씩 더 생기고(WeeklyAlertModule),
    // 정리해야 할 BullMQ Worker가 늘어 정상 종료 자체가 더 걸린다 — 90s로는
    // 부족해 200s로 늘렸다(실측 100초 안팎).
    await app.close();
  }, 200000);

  it(`서로 다른 ${CONCURRENT_REQUESTS}명의 동시 요청에서 P95가 1초 이내다`, async () => {
    const password = 'LoadTest!Pass123';
    const passwordHash = await bcrypt.hash(password, 4);

    // 서로 다른 직원 100명 — 단일 직원에 몰아넣으면 DeviceBindingService의
    // 직원별 advisory lock이 인위적인 직렬화를 만들어 실제 운영 패턴과
    // 다른 조건을 측정하게 된다(계획서 §10).
    const employees = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }).map(async (_, i) => {
        const employee = await adminPrisma.employee.create({
          data: {
            employeeNo: `LOAD-${i}`,
            name: `부하테스트-${i}`,
            employmentType: 'REGULAR',
            hireDate: new Date('2024-01-01'),
            primarySiteId: fixture.siteA.id,
          },
        });
        await adminPrisma.employeeCredential.create({
          data: { employeeId: employee.id, passwordHash, mustChangePassword: false },
        });
        await adminPrisma.employeeSiteAssignment.create({
          data: { employeeId: employee.id, siteId: fixture.siteA.id, assignmentRole: 'PRIMARY', startDate: new Date('2024-01-01') },
        });
        return employee;
      }),
    );

    // 로그인(=기기 최초 등록)은 측정 구간 밖에서 미리 끝낸다 — 이미 신뢰된
    // 기기로 찍어야 DeviceBindingService의 1회성 audit_log 경로를 피해
    // 정상 운영 패턴(반복 사용)을 측정할 수 있다.
    const tokens = await loginInChunks(
      app,
      employees.map((e) => ({ employeeNo: e.employeeNo, password, deviceId: `dev-load-${e.employeeNo}` })),
    );

    const recordedAt = '2026-06-15T09:00:00+09:00';
    const durationsMs = await Promise.all(
      employees.map(async (e, i) => {
        const start = performance.now();
        const res = await request(app.getHttpServer())
          .post('/punches')
          .set('Authorization', `Bearer ${tokens[i].accessToken}`)
          .send({
            punchType: 'IN',
            recordedAt,
            siteId: fixture.siteA.id,
            registrationMethod: 'PC',
            deviceId: `dev-load-${e.employeeNo}`,
            clientEventId: `load-evt-${e.employeeNo}`,
          });
        const elapsed = performance.now() - start;
        expect([200, 201]).toContain(res.status);
        return elapsed;
      }),
    );

    const sorted = [...durationsMs].sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);

    // eslint-disable-next-line no-console
    console.log(
      `[P95] n=${sorted.length} min=${sorted[0].toFixed(1)}ms p50=${percentile(sorted, 50).toFixed(1)}ms ` +
        `p95=${p95.toFixed(1)}ms max=${sorted[sorted.length - 1].toFixed(1)}ms`,
    );

    // 측정은 끝났다 — 재계산/부정사용탐지 큐에 남은 잔량(최대 200개, 이 스펙이
    // 검증하지 않는 부수효과)을 여기서 바로 비운다. afterAll의 app.close()가
    // BullMQ Worker의 대기열 잔량을 전부 소진할 때까지 기다리지 않게 하기 위해서다
    // (직접 겪음: 그대로 두면 200개 실제 잡 처리에 90초 넘게 걸려 훅이 타임아웃한다).
    // STEP9/STEP10: recalculation 잡마다 weekly-alert 잡이 하나씩 더 생기고
    // (RecalculationConsumer→WeeklyAlertTriggerService), weekly-alert 평가가
    // NotificationService.notify()를 타면 notifications 큐에도 잡이 쌓인다 —
    // 이 두 큐를 비우지 않으면 weekly-alert(동시성 2, 낮음)가 100개 잔량을
    // 다 처리할 때까지 app.close()가 기다리다 afterAll의 200초 훅 타임아웃을
    // 넘긴다(실측으로 확인한 문제 — 처음엔 recalc/fraud만 비웠다가 STEP9가
    // weekly-alert를 추가하면서 이 정리 목록이 갱신되지 않아 발생했다).
    //
    // 진짜 근본 원인(재검증으로 확인): obliterate({force:true})는 대기(waiting)
    // 잡뿐 아니라 그 순간 워커가 실제로 처리 중인(active) 잡의 Redis 데이터도
    // 함께 지운다. 처리 중이던 잡이 지워지면 해당 워커는 "처리 완료" 상태로
    // 전환하지 못해 내부 진행중 카운터가 영원히 줄지 않고, afterAll의
    // app.close()가 Worker.close()의 whenCurrentJobsFinished를 무한정
    // 기다리게 된다 — 정확히 concurrency 합(recalc 5 + fraud 5 = 10)만큼의
    // job이 "could not renew lock"을 몇 시간이고 반복하는 것으로 확인했다.
    // 그래서 obliterate 전에 각 큐의 active 카운트가 0이 될 때까지(워커가
    // 이미 붙잡고 있는 잡은 자연스럽게 끝내도록) 짧게 기다린 뒤에만 비운다.
    const recalcQueue = app.get<Queue>(getQueueToken(RECALCULATION_QUEUE_NAME));
    const fraudQueue = app.get<Queue>(getQueueToken(FRAUD_DETECTION_QUEUE_NAME));
    const weeklyAlertQueue = app.get<Queue>(getQueueToken(WEEKLY_ALERT_QUEUE_NAME));
    const notificationsQueue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));

    async function waitForActiveDrain(queue: Queue, timeoutMs = 15000): Promise<void> {
      const start = Date.now();
      // eslint-disable-next-line no-await-in-loop
      while ((await queue.getActiveCount()) > 0) {
        if (Date.now() - start > timeoutMs) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

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

    expect(p95).toBeLessThan(1000);
  }, 60000);
});
