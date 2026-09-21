import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture } from './fixtures';

describe('POST /device-tokens — 기기 토큰 등록/갱신', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('같은 (기기, 플랫폼)에 재등록하면 새 토큰으로 upsert되고 행이 늘지 않는다(앱 재설치 시나리오)', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-token-1');

    const first = await request(app.getHttpServer())
      .post('/device-tokens')
      .set(authHeader(accessToken))
      .send({ deviceId: 'dev-token-1', platform: 'ANDROID', token: 'fcm-token-original' });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/device-tokens')
      .set(authHeader(accessToken))
      .send({ deviceId: 'dev-token-1', platform: 'ANDROID', token: 'fcm-token-after-reinstall' });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const rows = await prisma.deviceToken.findMany({
      where: { employeeId: fixture.employees.plainEmployeeA.id, deviceId: 'dev-token-1' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe('fcm-token-after-reinstall');
    expect(rows[0].isValid).toBe(true);
  });

  it('같은 deviceId라도 플랫폼이 다르면 별개 행으로 등록된다', async () => {
    const { accessToken } = await login(app, fixture.employees.regional.employeeNo, fixture.password, 'dev-token-2');

    await request(app.getHttpServer())
      .post('/device-tokens')
      .set(authHeader(accessToken))
      .send({ deviceId: 'dev-token-2', platform: 'WEB', token: 'web-token' });
    await request(app.getHttpServer())
      .post('/device-tokens')
      .set(authHeader(accessToken))
      .send({ deviceId: 'dev-token-2', platform: 'ANDROID', token: 'android-token' });

    const rows = await prisma.deviceToken.findMany({
      where: { employeeId: fixture.employees.regional.id, deviceId: 'dev-token-2' },
    });
    expect(rows).toHaveLength(2);
  });
});
