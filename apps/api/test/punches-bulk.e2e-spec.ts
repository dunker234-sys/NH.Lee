import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadPunchPolicyConfigFixture } from './fixtures';

describe('POST /punches/bulk — 오프라인 큐 벌크 업로드', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPunchPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('혼합 배치 — 건별 성공/중복 결과를 요청 순서 그대로 배열로 응답한다', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-bulk-1');
    const now = new Date().toISOString();

    const first = {
      punchType: 'IN',
      recordedAt: '2026-05-01T09:00:00+09:00',
      siteId: fixture.siteA.id,
      registrationMethod: 'GPS',
      deviceId: 'dev-bulk-1',
      clientEventId: 'bulk-evt-1',
    };
    const duplicateOfFirst = { ...first, clientEventId: 'bulk-evt-1-resent' };
    const second = {
      punchType: 'OUT',
      recordedAt: '2026-05-01T18:00:00+09:00',
      siteId: fixture.siteA.id,
      registrationMethod: 'GPS',
      deviceId: 'dev-bulk-1',
      clientEventId: 'bulk-evt-2',
    };

    const res = await request(app.getHttpServer())
      .post('/punches/bulk')
      .set(authHeader(accessToken))
      .send({ items: [first, duplicateOfFirst, second], lastKnownServerSyncTime: now });

    expect(res.status).toBe(201);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.results[0]).toMatchObject({ index: 0, status: 'CREATED' });
    expect(res.body.results[1]).toMatchObject({ index: 1, status: 'DUPLICATE' });
    expect(res.body.results[2]).toMatchObject({ index: 2, status: 'CREATED' });
    expect(res.body.results[0].punchId).toBe(res.body.results[1].punchId);

    const rows = await prisma.punchRaw.findMany({
      where: { employeeId: fixture.employees.plainEmployeeA.id, deviceId: 'dev-bulk-1' },
    });
    expect(rows).toHaveLength(2); // first + second만, duplicateOfFirst는 새로 저장되지 않는다
  });

  it('단말이 마지막 동기화 시각보다 이전 시각을 주장하면 시계 조작 의심 플래그가 붙는다', async () => {
    const { accessToken } = await login(app, fixture.employees.regional.employeeNo, fixture.password, 'dev-bulk-clock');
    const lastKnownServerSyncTime = '2026-05-02T10:00:00.000Z';

    const res = await request(app.getHttpServer())
      .post('/punches/bulk')
      .set(authHeader(accessToken))
      .send({
        items: [
          {
            punchType: 'IN',
            // 마지막 동기화보다 1시간 이전 — 물리적으로 불가능(단말 시계가 되감긴 것으로 의심).
            recordedAt: '2026-05-02T09:00:00.000Z',
            siteId: fixture.siteA.id,
            registrationMethod: 'GPS',
            deviceId: 'dev-bulk-clock',
            clientEventId: 'bulk-clock-1',
          },
        ],
        lastKnownServerSyncTime,
      });

    expect(res.body.results[0].status).toBe('CREATED');
    const row = await prisma.punchRaw.findUniqueOrThrow({ where: { id: res.body.results[0].punchId } });
    expect(row.integrityFlags).toContain('DEVICE_CLOCK_ROLLBACK_SUSPECTED');
  });

  it('오프라인 큐의 큰 지연은 부정 신호로 보지 않는다(단일 엔드포인트의 동일 지연과 대조)', async () => {
    // 오프라인 벌크: recordedAt이 실제 지금보다 한참 전 — 부정 신호로 취급하지 않는다.
    const { accessToken: bulkToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-bulk-gap');
    const bulkRes = await request(app.getHttpServer())
      .post('/punches/bulk')
      .set(authHeader(bulkToken))
      .send({
        items: [
          {
            punchType: 'IN',
            recordedAt: '2026-01-05T09:00:00+09:00',
            siteId: fixture.siteA.id,
            registrationMethod: 'GPS',
            deviceId: 'dev-bulk-gap',
            clientEventId: 'bulk-gap-1',
          },
        ],
        lastKnownServerSyncTime: new Date().toISOString(),
      });
    const bulkRow = await prisma.punchRaw.findUniqueOrThrow({ where: { id: bulkRes.body.results[0].punchId } });
    expect(bulkRow.integrityFlags).not.toContain('UNEXPLAINED_TIME_GAP');

    // 단일(온라인) 엔드포인트: 같은 크기의 지연이면 UNEXPLAINED_TIME_GAP이 붙는다(대조군).
    const { accessToken: singleToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-bulk-gap');
    const singleRes = await request(app.getHttpServer())
      .post('/punches')
      .set(authHeader(singleToken))
      .send({
        punchType: 'OUT',
        recordedAt: '2026-01-05T18:00:00+09:00',
        siteId: fixture.siteA.id,
        registrationMethod: 'GPS',
        deviceId: 'dev-bulk-gap',
        clientEventId: 'single-gap-1',
      });
    const singleRow = await prisma.punchRaw.findUniqueOrThrow({ where: { id: singleRes.body.punchId } });
    expect(singleRow.integrityFlags).toContain('UNEXPLAINED_TIME_GAP');
  });
});
