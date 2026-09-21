import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Queue } from 'bullmq';
import request from 'supertest';
import { FRAUD_DETECTION_QUEUE_NAME } from '../src/modules/fraud-detection/queue.constants';
import { RECALCULATION_QUEUE_NAME } from '../src/modules/recalculation/queue.constants';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import {
  Fixture,
  loadFixture,
  loadKioskDeviceFixture,
  loadKioskPolicyConfigFixture,
  loadPolicyConfigFixture,
  loadPunchPolicyConfigFixture,
} from './fixtures';

const HEADCOUNT = 10;

/** 완료조건: 키오스크에서 사번+PIN으로 10명 연속 타각이 각 5초 이내에 완료된다. */
describe('POST /kiosk/punches — 순차 타각 타이밍', () => {
  let app: INestApplication;
  let fixture: Fixture;
  let kioskCredential: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPunchPolicyConfigFixture();
    await loadKioskPolicyConfigFixture();

    const device = await loadKioskDeviceFixture(fixture.siteA.id, '타이밍테스트키오스크', fixture.employees.siteManagerA.id);
    kioskCredential = device.credential;

    app = await createTestApp();

    const recalcQueue = app.get<Queue>(getQueueToken(RECALCULATION_QUEUE_NAME));
    const fraudQueue = app.get<Queue>(getQueueToken(FRAUD_DETECTION_QUEUE_NAME));
    await Promise.all([recalcQueue.obliterate({ force: true }), fraudQueue.obliterate({ force: true })]);
  }, 60000);

  afterAll(async () => {
    await app.close();
  }, 90000);

  it(`사번+PIN으로 ${HEADCOUNT}명이 줄 서서 순차 타각해도 각 호출이 5초 이내에 끝난다`, async () => {
    const pin = '1234';
    const pinHash = await bcrypt.hash(pin, 4); // 테스트 전용 저비용 bcrypt

    const employees = await Promise.all(
      Array.from({ length: HEADCOUNT }).map(async (_, i) => {
        const employee = await adminPrisma.employee.create({
          data: {
            employeeNo: `KIOSK-${i}`,
            name: `키오스크테스트-${i}`,
            employmentType: 'REGULAR',
            hireDate: new Date('2024-01-01'),
            primarySiteId: fixture.siteA.id,
          },
        });
        await adminPrisma.employeeCredential.create({
          data: { employeeId: employee.id, passwordHash: pinHash, mustChangePassword: false, pinHash, pinSetAt: new Date() },
        });
        await adminPrisma.employeeSiteAssignment.create({
          data: { employeeId: employee.id, siteId: fixture.siteA.id, assignmentRole: 'PRIMARY', startDate: new Date('2024-01-01') },
        });
        return employee;
      }),
    );

    const durationsMs: number[] = [];
    // 동시가 아니라 순차 — "줄 서서 한 명씩" 시나리오를 그대로 재현한다.
    for (let i = 0; i < employees.length; i += 1) {
      const employee = employees[i];
      const start = performance.now();
      const res = await request(app.getHttpServer())
        .post('/kiosk/punches')
        .set('X-Kiosk-Device-Credential', kioskCredential)
        .send({
          employeeNo: employee.employeeNo,
          pin,
          punchType: 'IN',
          recordedAt: new Date().toISOString(),
          clientEventId: `kiosk-timing-${i}`,
        });
      const elapsed = performance.now() - start;
      expect(res.status).toBe(201);
      expect(res.body.maskedName).toBeTruthy();
      // 전체 이름 원문이 응답 어디에도 없어야 한다(개인정보 노출 최소화).
      expect(JSON.stringify(res.body)).not.toContain(employee.name);
      durationsMs.push(elapsed);
    }

    // eslint-disable-next-line no-console
    console.log(`[kiosk timing] ${durationsMs.map((d) => d.toFixed(0)).join(', ')}ms`);
    durationsMs.forEach((d) => expect(d).toBeLessThan(5000));

    const recalcQueue = app.get<Queue>(getQueueToken(RECALCULATION_QUEUE_NAME));
    const fraudQueue = app.get<Queue>(getQueueToken(FRAUD_DETECTION_QUEUE_NAME));
    await Promise.all([recalcQueue.obliterate({ force: true }), fraudQueue.obliterate({ force: true })]);
  }, 60000);
});
