import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadPunchPolicyConfigFixture, loadSiteIpAllowlistFixture } from './fixtures';

/**
 * 완료조건: PC 웹에서 허용목록 밖 IP로 접근 시 타각이 차단되고 사유가
 * 안내된다. supertest는 항상 루프백(::ffff:127.0.0.1)으로만 접속하므로,
 * 임의의 외부 IP에 대한 차단은 이 파일이 아니라
 * ip-allowlist.guard.spec.ts(가짜 ExecutionContext 직접 호출)가 결정적으로
 * 검증한다 — 이 e2e는 실제 배선(컨트롤러→가드→CIDR매칭→차단 응답)이
 * 동작함을 증명한다.
 */
describe('POST /punches — IP 허용목록(PC 전용)', () => {
  let app: INestApplication;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPunchPolicyConfigFixture();
    // siteA: 테스트 클라이언트의 실제 루프백 주소를 허용목록에 포함.
    await loadSiteIpAllowlistFixture(fixture.siteA.id, '127.0.0.1/32', '허용 사업장');
    // siteB: 의도적으로 도달 불가능한 대역만 등록(RFC5737 TEST-NET-3) — 루프백은 절대 매치되지 않는다.
    await loadSiteIpAllowlistFixture(fixture.siteB.id, '203.0.113.0/24', '차단 사업장');
    app = await createTestApp();
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('허용목록에 포함된 사업장(siteA)에서는 PC 타각이 성공한다', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-ip-allow');
    const res = await request(app.getHttpServer())
      .post('/punches')
      .set(authHeader(accessToken))
      .send({
        punchType: 'IN',
        recordedAt: '2026-07-01T09:00:00+09:00',
        siteId: fixture.siteA.id,
        registrationMethod: 'PC',
        deviceId: 'dev-ip-allow',
        clientEventId: 'ip-allow-1',
      });
    expect([200, 201]).toContain(res.status);
  });

  it('허용목록 밖 사업장(siteB)에서는 PC 타각이 403 IP_NOT_ALLOWED로 차단되고 사유가 안내된다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerB.employeeNo, fixture.password, 'dev-ip-deny');
    const res = await request(app.getHttpServer())
      .post('/punches')
      .set(authHeader(accessToken))
      .send({
        punchType: 'IN',
        recordedAt: '2026-07-01T09:00:00+09:00',
        siteId: fixture.siteB.id,
        registrationMethod: 'PC',
        deviceId: 'dev-ip-deny',
        clientEventId: 'ip-deny-1',
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IP_NOT_ALLOWED');
    expect(res.body.message).toEqual(expect.any(String));
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it('허용목록이 전혀 없는 사업장은 fail-closed로 차단된다', async () => {
    const region = await adminPrisma.region.create({ data: { code: 'RG-NOALLOW', name: '무허용목록권역' } });
    const siteNoAllowlist = await adminPrisma.site.create({
      data: { code: 'SITE-NOALLOW', name: '허용목록없는사업장', regionId: region.id },
    });
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-ip-noallow');
    const res = await request(app.getHttpServer())
      .post('/punches')
      .set(authHeader(accessToken))
      .send({
        punchType: 'IN',
        recordedAt: '2026-07-01T09:00:00+09:00',
        siteId: siteNoAllowlist.id,
        registrationMethod: 'PC',
        deviceId: 'dev-ip-noallow',
        clientEventId: 'ip-noallow-1',
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IP_NOT_ALLOWED');
  });

  it('GPS/NFC/QR 등록수단은 IP 허용목록의 영향을 받지 않는다', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerB.employeeNo, fixture.password, 'dev-ip-gps');
    const res = await request(app.getHttpServer())
      .post('/punches')
      .set(authHeader(accessToken))
      .send({
        punchType: 'IN',
        recordedAt: '2026-07-01T09:00:00+09:00',
        siteId: fixture.siteB.id, // siteB는 허용목록에 루프백이 없지만 PC가 아니므로 무관
        registrationMethod: 'GPS',
        deviceId: 'dev-ip-gps',
        clientEventId: 'ip-gps-1',
      });
    expect([200, 201]).toContain(res.status);
  });
});
