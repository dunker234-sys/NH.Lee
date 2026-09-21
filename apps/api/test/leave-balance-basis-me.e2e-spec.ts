import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture } from './fixtures';

function workDateOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** 요구사항서4.3 §4: 근로자 화면에서 산출 근거 조회 가능. */
describe('GET /me/leave-balances — 본인 잔여일수 산출 근거 조회', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('본인의 잔액과 산출 근거(basis)를 그대로 조회할 수 있고, 타인의 잔액은 보이지 않는다', async () => {
    const leaveType = await prisma.leaveType.create({
      data: { code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' },
    });
    const basis = { reasonCode: 'FULL_YEAR_GRANT', seniorityAddonDays: 1, legalReferences: ['근로기준법 제60조①'] };
    await prisma.leaveBalance.create({
      data: {
        employeeId: fixture.employees.plainEmployeeA.id,
        leaveTypeId: leaveType.id,
        referencePeriod: '2026-me-basis',
        effectiveDate: workDateOf('2026-01-01'),
        expiryDate: workDateOf('2026-12-31'),
        grantedDays: 16,
        basis: basis as never,
      },
    });
    await prisma.leaveBalance.create({
      data: {
        employeeId: fixture.employees.regional.id,
        leaveTypeId: leaveType.id,
        referencePeriod: '2026-me-basis-other',
        effectiveDate: workDateOf('2026-01-01'),
        expiryDate: workDateOf('2026-12-31'),
        grantedDays: 20,
        basis: {} as never,
      },
    });

    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-balance-me');
    const res = await request(app.getHttpServer()).get('/me/leave-balances').set(auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].grantedDays).toBe('16');
    expect(res.body[0].basis).toEqual(basis);
    expect(res.body.every((b: { employeeId: string }) => b.employeeId === fixture.employees.plainEmployeeA.id)).toBe(true);
  });
});
