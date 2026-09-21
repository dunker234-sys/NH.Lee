import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PunchRawRepository } from '../src/common/punch/punch-raw.repository';
import { resolveVerificationLevel } from '../src/common/punch/verification-level.util';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { Fixture, loadFixture } from './fixtures';

/**
 * STEP 2 완료조건 4의 나머지 절반: "그 결과 타각이 LOW로 기록된다"를 실제
 * punch_raw insert까지 통해서 증명한다. POST /punches 자체는 STEP 4의 몫이라
 * 여기서는 로그인이 돌려준 deviceTrust를 resolveVerificationLevel()에 흘려
 * PunchRawRepository.create()로 실제 저장까지 확인한다.
 */
describe('기기 신뢰 → punch_raw.verification_level', () => {
  let app: INestApplication;
  let fixture: Fixture;
  let prisma: PrismaService;
  let punchRawRepo: PunchRawRepository;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    punchRawRepo = app.get(PunchRawRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  it('신뢰 기기는 NORMAL, 미등록 기기는 LOW로 punch_raw에 기록된다', async () => {
    const employee = fixture.employees.plainEmployeeA;

    const trustedLogin = await request(app.getHttpServer()).post('/auth/login').send({
      employeeNo: employee.employeeNo,
      password: fixture.password,
      deviceId: 'trusted-device',
    });
    expect(trustedLogin.body.deviceTrust).toBe(true);

    const untrustedLogin = await request(app.getHttpServer()).post('/auth/login').send({
      employeeNo: employee.employeeNo,
      password: fixture.password,
      deviceId: 'new-unregistered-device',
    });
    expect(untrustedLogin.status).toBe(200); // 차단되지 않는다
    expect(untrustedLogin.body.deviceTrust).toBe(false);

    const normalPunch = await punchRawRepo.create({
      employeeId: employee.id,
      siteId: fixture.siteA.id,
      punchType: 'IN',
      recordedAt: new Date(),
      workDate: new Date(),
      idempotencyKey: 'e2e-normal-punch-1',
      verificationLevel: resolveVerificationLevel(trustedLogin.body.deviceTrust),
      registrationMethod: 'NFC',
      deviceId: 'trusted-device',
    });
    expect(normalPunch.verificationLevel).toBe('NORMAL');

    const lowPunch = await punchRawRepo.create({
      employeeId: employee.id,
      siteId: fixture.siteA.id,
      punchType: 'IN',
      recordedAt: new Date(),
      workDate: new Date(),
      idempotencyKey: 'e2e-low-punch-1',
      verificationLevel: resolveVerificationLevel(untrustedLogin.body.deviceTrust),
      registrationMethod: 'NFC',
      deviceId: 'new-unregistered-device',
    });
    expect(lowPunch.verificationLevel).toBe('LOW');

    // DB에 실제로 그렇게 저장됐는지 별도 조회로 재확인한다.
    const storedLow = await prisma.punchRaw.findUniqueOrThrow({ where: { id: lowPunch.id } });
    expect(storedLow.verificationLevel).toBe('LOW');
    const storedNormal = await prisma.punchRaw.findUniqueOrThrow({ where: { id: normalPunch.id } });
    expect(storedNormal.verificationLevel).toBe('NORMAL');
  });
});
