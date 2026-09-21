import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { FRAUD_DETECTION_QUEUE_NAME, FraudDetectionJobData } from '../src/modules/fraud-detection/queue.constants';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadPunchPolicyConfigFixture } from './fixtures';

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10000, intervalMs = 200): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`waitFor 타임아웃(${timeoutMs}ms) 초과`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** 완료조건과 별개로, STEP4가 실제로 만든 비동기 부정사용 탐지 3종을 실제 BullMQ+Postgres로 검증한다. */
describe('부정사용 비동기 탐지 — PunchFraudSignal', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let queue: Queue<FraudDetectionJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPunchPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    queue = app.get<Queue<FraudDetectionJobData>>(getQueueToken(FRAUD_DETECTION_QUEUE_NAME));
  }, 60000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await app.close();
  });

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function punch(token: string, body: Record<string, unknown>) {
    const res = await request(app.getHttpServer()).post('/punches').set(authHeader(token)).send(body);
    return res.body.punchId as string;
  }

  it('짧은 시간 내 물리적으로 불가능한 이동 거리 → IMPOSSIBLE_TRAVEL_SPEED 신호가 생긴다', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-fraud-speed');

    await punch(accessToken, {
      punchType: 'IN',
      recordedAt: '2026-06-01T09:00:00+09:00',
      siteId: fixture.siteA.id,
      location: { lat: 37.5665, lng: 126.978, accuracyM: 10 }, // 서울
      registrationMethod: 'GPS',
      deviceId: 'dev-fraud-speed',
      clientEventId: 'fraud-speed-1',
    });
    const secondPunchId = await punch(accessToken, {
      punchType: 'OUT',
      recordedAt: '2026-06-01T09:01:00+09:00', // 1분 뒤
      siteId: fixture.siteA.id,
      location: { lat: 35.1796, lng: 129.0756, accuracyM: 10 }, // 부산(약 325km)
      registrationMethod: 'GPS',
      deviceId: 'dev-fraud-speed',
      clientEventId: 'fraud-speed-2',
    });

    await waitFor(async () => {
      const signal = await prisma.punchFraudSignal.findFirst({
        where: { punchId: secondPunchId, signalType: 'IMPOSSIBLE_TRAVEL_SPEED' },
      });
      return signal !== null;
    });
  });

  it('임계 횟수를 넘는 동일 좌표 반복 → REPEATED_EXACT_COORDINATES 신호가 생긴다', async () => {
    const { accessToken } = await login(app, fixture.employees.regional.employeeNo, fixture.password, 'dev-fraud-repeat');
    const coords = { lat: 37.5665, lng: 126.978, accuracyM: 10 };
    const punchTypes = ['IN', 'BREAK_OUT', 'BREAK_IN', 'OUT'];
    let lastPunchId = '';

    for (let i = 0; i < punchTypes.length; i += 1) {
      lastPunchId = await punch(accessToken, {
        punchType: punchTypes[i],
        recordedAt: `2026-06-02T${String(9 + i).padStart(2, '0')}:00:00+09:00`,
        siteId: fixture.siteA.id,
        location: coords,
        registrationMethod: 'GPS',
        deviceId: 'dev-fraud-repeat',
        clientEventId: `fraud-repeat-${i}`,
      });
    }

    // policy_config.repeated_coordinate_max_count(기본 3) 초과 — 4번째 타각에서 신호가 발생한다.
    await waitFor(async () => {
      const signal = await prisma.punchFraudSignal.findFirst({
        where: { punchId: lastPunchId, signalType: 'REPEATED_EXACT_COORDINATES' },
      });
      return signal !== null;
    });
  });

  it('동일 기기ID를 서로 다른 두 사번이 사용하면 SHARED_DEVICE_MULTIPLE_EMPLOYEES 신호가 생긴다', async () => {
    const sharedDeviceId = 'dev-fraud-shared';
    const loginA = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, sharedDeviceId);
    const loginB = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, sharedDeviceId);

    await punch(loginA.accessToken, {
      punchType: 'IN',
      recordedAt: '2026-06-03T09:00:00+09:00',
      siteId: fixture.siteA.id,
      registrationMethod: 'GPS',
      deviceId: sharedDeviceId,
      clientEventId: 'fraud-shared-1',
    });
    const secondEmployeePunchId = await punch(loginB.accessToken, {
      punchType: 'IN',
      recordedAt: '2026-06-03T09:10:00+09:00',
      siteId: fixture.siteA.id,
      registrationMethod: 'GPS',
      deviceId: sharedDeviceId,
      clientEventId: 'fraud-shared-2',
    });

    await waitFor(async () => {
      const signal = await prisma.punchFraudSignal.findFirst({
        where: { punchId: secondEmployeePunchId, signalType: 'SHARED_DEVICE_MULTIPLE_EMPLOYEES' },
      });
      return signal !== null;
    });
  });
});
