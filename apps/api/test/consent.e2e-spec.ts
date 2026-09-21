import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadConsentPolicyConfigFixture, loadFixture, loadPunchPolicyConfigFixture } from './fixtures';

describe('Consent — 위치정보 수집 동의(self-scoped)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    // location_retention_days(punch-policy)와 location_consent_policy_version(consent-policy)
    // 둘 다 필요하다 — ConsentService.getPolicy()가 두 출처의 policy_config를 함께 읽는다.
    await loadPunchPolicyConfigFixture();
    await loadConsentPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('GET /consent/policy는 policy_config에서 정책버전·보유기간을 읽어 반환한다', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-consent-1');
    const res = await request(app.getHttpServer())
      .get('/consent/policy')
      .query({ type: 'LOCATION_COLLECTION' })
      .set(authHeader(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ policyVersion: 'v1', retentionDays: 30 });
  });

  it('클라이언트가 policyVersion을 보내도(whitelist 위반) 400으로 거부된다 — 서버가 유일한 출처', async () => {
    const { accessToken } = await login(app, fixture.employees.regional.employeeNo, fixture.password, 'dev-consent-2');
    const res = await request(app.getHttpServer())
      .post('/consent')
      .set(authHeader(accessToken))
      .send({ consentType: 'LOCATION_COLLECTION', policyVersion: 'client-injected' });
    expect(res.status).toBe(400);
  });

  it('동의→일시중지→재개 흐름이 이력에 모두 남고 current가 최신 상태를 반영한다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-consent-3');
    const employeeId = fixture.employees.hqHr.id;

    const agree = await request(app.getHttpServer())
      .post('/consent')
      .set(authHeader(accessToken))
      .send({ consentType: 'LOCATION_COLLECTION' });
    expect(agree.status).toBe(201);
    expect(agree.body.status).toBe('AGREED');
    expect(agree.body.policyVersion).toBe('v1');

    const pause = await request(app.getHttpServer()).post('/consent/location/pause').set(authHeader(accessToken));
    expect(pause.status).toBe(201);
    expect(pause.body.status).toBe('PAUSED');

    const afterPause = await request(app.getHttpServer())
      .get('/consent')
      .query({ type: 'LOCATION_COLLECTION' })
      .set(authHeader(accessToken));
    expect(afterPause.body.current.status).toBe('PAUSED');
    expect(afterPause.body.history).toHaveLength(2);
    expect(afterPause.body.history.map((h: { status: string }) => h.status)).toEqual(['PAUSED', 'AGREED']);

    const resume = await request(app.getHttpServer())
      .post('/consent')
      .set(authHeader(accessToken))
      .send({ consentType: 'LOCATION_COLLECTION' });
    expect(resume.status).toBe(201);
    expect(resume.body.status).toBe('AGREED');

    const rows = await prisma.consent.findMany({ where: { employeeId, consentType: 'LOCATION_COLLECTION' } });
    // pause 재사용이 아니라 매번 새 행 — 재개는 이전 PAUSED 행을 덮어쓰지 않는다.
    expect(rows).toHaveLength(3);
  });

  it('철회는 WITHDRAWN 이력을 남기고, 타 직원 이력을 오염시키지 않는다', async () => {
    const employeeAuth = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-consent-4');
    const otherAuth = await login(app, fixture.employees.siteManagerB.employeeNo, fixture.password, 'dev-consent-5');

    await request(app.getHttpServer())
      .post('/consent')
      .set(authHeader(employeeAuth.accessToken))
      .send({ consentType: 'LOCATION_COLLECTION' });

    const withdraw = await request(app.getHttpServer())
      .post('/consent/location/withdraw')
      .set(authHeader(employeeAuth.accessToken));
    expect(withdraw.status).toBe(201);
    expect(withdraw.body.status).toBe('WITHDRAWN');
    expect(withdraw.body.withdrawnAt).toBeTruthy();

    const otherStatus = await request(app.getHttpServer())
      .get('/consent')
      .query({ type: 'LOCATION_COLLECTION' })
      .set(authHeader(otherAuth.accessToken));
    expect(otherStatus.body.current).toBeNull();
    expect(otherStatus.body.history).toHaveLength(0);
  });
});
