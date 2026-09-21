import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { Fixture, loadFixture } from './fixtures';

/** STEP 2 완료조건 4: 미등록 기기 로그인은 차단되지 않고 LOW 레벨 대상으로 표시된다. */
describe('로그인 · 기기 신뢰 · 잠금', () => {
  let app: INestApplication;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('첫 로그인 기기는 자동으로 신뢰(deviceTrust=true)된다', async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({
      employeeNo: fixture.employees.plainEmployeeA.employeeNo,
      password: fixture.password,
      deviceId: 'device-first',
    });

    expect(res.status).toBe(200);
    expect(res.body.deviceTrust).toBe(true);
    expect(res.body.isNewDevice).toBe(true);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('두 번째(미등록) 기기로 로그인해도 차단되지 않고 200이지만 deviceTrust=false다', async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({
      employeeNo: fixture.employees.plainEmployeeA.employeeNo,
      password: fixture.password,
      deviceId: 'device-second-unregistered',
    });

    expect(res.status).toBe(200); // ★ 차단되지 않는다
    expect(res.body.deviceTrust).toBe(false);
    expect(res.body.isNewDevice).toBe(true);
  });

  it('같은(이미 등록된) 기기로 다시 로그인하면 그때의 신뢰 상태가 유지된다', async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({
      employeeNo: fixture.employees.plainEmployeeA.employeeNo,
      password: fixture.password,
      deviceId: 'device-second-unregistered',
    });

    expect(res.status).toBe(200);
    expect(res.body.deviceTrust).toBe(false);
    expect(res.body.isNewDevice).toBe(false);
  });

  it('리프레시 토큰으로 액세스 토큰을 재발급받을 수 있다', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({
      employeeNo: fixture.employees.hqHr.employeeNo,
      password: fixture.password,
      deviceId: 'device-hq',
    });

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    // 액세스 토큰의 iat는 초 단위 정밀도라 같은 초 안에 발급되면 페이로드가 완전히
    // 같아 문자열도 우연히 같을 수 있다 — 회전이 실제로 일어났는지는 refreshToken
    // (랜덤 바이트 기반이라 항상 달라진다)로 확인하는 게 맞는 검증이다.
    expect(refreshed.body.refreshToken).toBeTruthy();
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);
  });

  it('이미 회전(폐기)된 리프레시 토큰을 다시 쓰면 재사용 탐지로 거부된다', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({
      employeeNo: fixture.employees.hqHr.employeeNo,
      password: fixture.password,
      deviceId: 'device-hq-2',
    });
    const oldRefreshToken = login.body.refreshToken as string;

    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: oldRefreshToken });

    const reused = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken });

    expect(reused.status).toBe(401);
    expect(reused.body.code).toBe('REFRESH_TOKEN_REUSED');
  });

  it('로그인 실패가 임계값을 넘으면 계정이 잠기고, 올바른 비밀번호로도 로그인할 수 없다', async () => {
    const employeeNo = fixture.employees.regional.employeeNo;

    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ employeeNo, password: 'wrong-password', deviceId: 'device-lockout' });
    }

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ employeeNo, password: fixture.password, deviceId: 'device-lockout' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });
});
