import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import {
  Fixture,
  loadFixture,
  loadKioskDeviceFixture,
  loadKioskPolicyConfigFixture,
  loadPolicyConfigFixture,
  loadPunchPolicyConfigFixture,
  setEmployeePinFixture,
} from './fixtures';

/** 완료조건: 키오스크 오프라인 상태에서 타각 후 복구 시 중복 없이 전송된다. */
describe('POST /kiosk/punches/bulk — 오프라인 복구 재전송', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let kioskCredential: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPunchPolicyConfigFixture();
    await loadKioskPolicyConfigFixture();
    await setEmployeePinFixture(fixture.employees.plainEmployeeA.id, '1234');
    await setEmployeePinFixture(fixture.employees.hqHr.id, '5678');

    const device = await loadKioskDeviceFixture(fixture.siteA.id, '오프라인복구테스트키오스크', fixture.employees.siteManagerA.id);
    kioskCredential = device.credential;

    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('같은 clientEventId/recordedAt/employeeNo로 재연결 재시도해도 punch_raw는 1건만 남는다', async () => {
    const recordedAt = '2026-08-01T09:00:00+09:00';
    const item = {
      employeeNo: fixture.employees.plainEmployeeA.employeeNo,
      pin: '1234',
      punchType: 'IN',
      recordedAt,
      clientEventId: 'kiosk-offline-evt-1',
    };

    // 1차 시도: 네트워크가 잠깐 복구됐다가 응답 전에 다시 끊긴 상황을 흉내 —
    // 서버에는 도달했지만 클라이언트가 결과를 확인하지 못해 큐에 남아있는 것.
    const first = await request(app.getHttpServer())
      .post('/kiosk/punches/bulk')
      .set('X-Kiosk-Device-Credential', kioskCredential)
      .send({ items: [item], lastKnownServerSyncTime: '2026-08-01T00:00:00.000Z' });
    expect(first.status).toBe(201);
    expect(first.body.results).toHaveLength(1);
    expect(first.body.results[0].status).toBe('CREATED');

    // 2차 재시도: 완전히 동일한 페이로드(재계산 없이 그대로 재전송) — 완료조건이 요구하는 시나리오.
    const second = await request(app.getHttpServer())
      .post('/kiosk/punches/bulk')
      .set('X-Kiosk-Device-Credential', kioskCredential)
      .send({ items: [item], lastKnownServerSyncTime: '2026-08-01T00:00:00.000Z' });
    expect(second.status).toBe(201);
    expect(second.body.results[0].status).toBe('DUPLICATE');

    const rows = await prisma.punchRaw.findMany({
      where: { employeeId: fixture.employees.plainEmployeeA.id, punchType: 'IN', recordedAt: new Date(recordedAt) },
    });
    expect(rows).toHaveLength(1);
  });

  it('오프라인 중 여러 직원이 섞여 쌓인 배치도 항목별로 각자의 PIN을 검증한다', async () => {
    const items = [
      {
        employeeNo: fixture.employees.plainEmployeeA.employeeNo,
        pin: '1234',
        punchType: 'OUT',
        recordedAt: '2026-08-01T18:00:00+09:00',
        clientEventId: 'kiosk-offline-mixed-1',
      },
      {
        employeeNo: fixture.employees.hqHr.employeeNo,
        pin: '5678',
        punchType: 'IN',
        recordedAt: '2026-08-01T09:00:00+09:00',
        clientEventId: 'kiosk-offline-mixed-2',
      },
      {
        // 형식은 유효하지만(4자리 숫자) 실제 저장된 PIN과 다르다 — DTO 검증은
        // 통과하고 서비스 계층의 bcrypt.compare에서 걸러져야 항목별 FAILED로
        // 나온다(형식이 애초에 틀리면 배열 전체가 400으로 거부돼 이 항목만
        // 실패시키려는 의도와 맞지 않는다).
        employeeNo: fixture.employees.hqHr.employeeNo,
        pin: '0000',
        punchType: 'OUT',
        recordedAt: '2026-08-01T18:00:00+09:00',
        clientEventId: 'kiosk-offline-mixed-3',
      },
    ];

    const res = await request(app.getHttpServer())
      .post('/kiosk/punches/bulk')
      .set('X-Kiosk-Device-Credential', kioskCredential)
      .send({ items, lastKnownServerSyncTime: '2026-08-01T00:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(res.body.results[0].status).toBe('CREATED');
    expect(res.body.results[1].status).toBe('CREATED');
    expect(res.body.results[2].status).toBe('FAILED'); // 4자리 숫자가 아닌 PIN이라 검증 자체가 InvalidPinError
  });

  it('기기 자격증명이 잘못되면 KIOSK_DEVICE_INVALID로 거부된다', async () => {
    const res = await request(app.getHttpServer())
      .post('/kiosk/punches')
      .set('X-Kiosk-Device-Credential', 'not-a-real-credential')
      .send({
        employeeNo: fixture.employees.plainEmployeeA.employeeNo,
        pin: '1234',
        punchType: 'IN',
        recordedAt: new Date().toISOString(),
        clientEventId: 'kiosk-bad-device-1',
      });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('KIOSK_DEVICE_INVALID');
  });
});
