import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture } from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * STEP12: 개인정보 컬럼 암호화(EmployeeProtectedStatus.statusType) + 권한
 * 우회 재점검. HQ_HR 외 역할은 여전히 차단되고(기존 STEP6 RBAC 회귀),
 * DB에 실제로 저장되는 값은 평문이 아니라 AES-256-GCM 암호문임을 직접
 * 확인한다.
 */
describe('보호상태 신고 — 권한 및 암호화 저장 (STEP12)', () => {
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

  it('HQ_HR 외 역할(SITE_MANAGER)은 403으로 거부된다(기존 RBAC 회귀 확인)', async () => {
    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-protected-status-block');
    const res = await request(app.getHttpServer())
      .post(`/employees/${fixture.employees.plainEmployeeA.id}/protected-status`)
      .set(auth(accessToken))
      .send({ statusType: 'PREGNANCY', effectiveStartDate: '2026-01-01' });
    expect(res.status).toBe(403);
  });

  it('HQ_HR은 저장할 수 있고, DB에는 평문이 아닌 암호문으로 저장된다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-protected-status-hqhr');
    const res = await request(app.getHttpServer())
      .post(`/employees/${fixture.employees.plainEmployeeA.id}/protected-status`)
      .set(auth(accessToken))
      .send({ statusType: 'PREGNANCY', effectiveStartDate: '2026-01-01' });
    expect(res.status).toBe(201);

    const row = await prisma.employeeProtectedStatus.findUniqueOrThrow({ where: { id: res.body.id } });
    // 평문 'PREGNANCY'가 그대로 저장되지 않는다 — hex(iv+authTag+ciphertext) 형태.
    expect(row.statusTypeEncrypted).not.toBe('PREGNANCY');
    expect(row.statusTypeEncrypted).not.toContain('PREGNANCY');
    expect(/^[0-9a-f]+$/.test(row.statusTypeEncrypted)).toBe(true);
  });
});
