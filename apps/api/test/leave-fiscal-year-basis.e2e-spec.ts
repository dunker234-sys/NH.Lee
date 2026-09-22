import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase, adminPrisma } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadLeavePolicyConfigFixture, loadPolicyConfigFixture } from './fixtures';

function workDateOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function kst(dateStr: string, hhmm: string): Date {
  return new Date(`${dateStr}T${hhmm}:00+09:00`);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** 연차 배치 관리 — 회계연도 전환(수정사항). */
describe('연차 회계연도 기준 전환', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadLeavePolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  async function createSchedule(employeeId: string, siteId: string, workDate: string) {
    return prisma.schedule.create({
      data: {
        employeeId,
        siteId,
        workDate: workDateOf(workDate),
        plannedStartAt: kst(workDate, '09:00'),
        plannedEndAt: kst(workDate, '18:00'),
        plannedBreakMinutes: 60,
        status: 'CONFIRMED',
      },
    });
  }

  it('FISCAL_YEAR 정책이 아니면 소급 재계산이 400으로 거부된다', async () => {
    const { accessToken } = await login(app, fixture.employees.admin.employeeNo, fixture.password, 'dev-fiscal-guard');
    const res = await request(app.getHttpServer())
      .post('/admin/leave/accrual/migrate-to-fiscal-year')
      .set(auth(accessToken))
      .send({ siteId: fixture.siteA.id, asOfDate: '2027-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ANNUAL_LEAVE_BASIS_NOT_FISCAL_YEAR');
  });

  it('ADMIN 외 역할(HQ_HR)은 소급 재계산을 호출할 수 없다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-fiscal-role-block');
    const res = await request(app.getHttpServer())
      .post('/admin/leave/accrual/migrate-to-fiscal-year')
      .set(auth(accessToken))
      .send({ siteId: fixture.siteA.id, asOfDate: '2027-01-01' });
    expect(res.status).toBe(403);
  });

  it('입사일 기준으로 이미 발생한 연차를, 회계연도 전환 후 소급 재계산하면 기존 행이 대체되고 사용일수는 보존된다', async () => {
    const employee = await prisma.employee.create({
      data: {
        employeeNo: 'T-FISCAL-1',
        name: '테스트-회계연도전환',
        employmentType: 'REGULAR',
        hireDate: workDateOf('2020-03-01'),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });
    await prisma.employeeSiteAssignment.create({
      data: { employeeId: employee.id, siteId: fixture.siteA.id, assignmentRole: 'PRIMARY', startDate: workDateOf('2020-03-01') },
    });

    const { accessToken: adminToken } = await login(app, fixture.employees.admin.employeeNo, fixture.password, 'dev-fiscal-admin');

    const typeRes = await request(app.getHttpServer())
      .post('/admin/leave/types')
      .set(auth(adminToken))
      .send({ code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' });
    expect(typeRes.status).toBe(201);
    const leaveTypeId = typeRes.body.id;

    // 1단계: 기존(ANNIVERSARY, 기본값) 기준으로 연차를 먼저 발생시킨다 — 입사
    // 연 단위(3/1~다음해 2/28) 근로일을 채운다. 산정기준일 직전 4주(초단시간
    // 게이트 통과용)는 평일마다 스케줄을 채워 넣는다.
    for (const d of ['2025-03-05', '2025-05-05', '2025-08-05', '2025-11-05']) {
      await createSchedule(employee.id, fixture.siteA.id, d);
    }
    async function fillWeekdays(monthPrefix: string, fromDay: number, toDay: number) {
      for (let i = fromDay; i <= toDay; i += 1) {
        const dateStr = `${monthPrefix}-${String(i).padStart(2, '0')}`;
        const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
        if (dow === 0 || dow === 6) continue; // 주말 제외
        await createSchedule(employee.id, fixture.siteA.id, dateStr);
      }
    }
    // ANNIVERSARY 발생(2026-03-01 기준)과 FISCAL_YEAR 소급 재계산(2026-01-01 기준)
    // 둘 다의 직전 4주 창을 커버한다.
    await fillWeekdays('2025-12', 5, 31);
    await fillWeekdays('2026-02', 2, 27);
    const anniversaryRun = await request(app.getHttpServer())
      .post('/admin/leave/accrual/run')
      .set(auth(adminToken))
      .send({ asOfDate: '2026-03-01', siteId: fixture.siteA.id });
    expect(anniversaryRun.status).toBe(201);
    expect(anniversaryRun.body.employeeIds).toContain(employee.id);

    const anniversaryBalance = await prisma.leaveBalance.findFirstOrThrow({ where: { employeeId: employee.id, leaveTypeId } });
    expect(anniversaryBalance.grantedDays.toNumber()).toBe(17);
    expect(anniversaryBalance.referencePeriod).toBe('2026-03-01');

    // 이미 5일을 사용한 상태를 흉내낸다 — 소급 재계산 후에도 이 사용량은 보존돼야 한다.
    await prisma.leaveBalance.update({ where: { id: anniversaryBalance.id }, data: { usedDays: 5 } });

    // 2단계: 회계연도(FISCAL_YEAR) 정책으로 전환 후, 2026년(직전 회계연도
    // 2025-01-01~12-31 근태 기준) 소급 재계산을 실행한다.
    await adminPrisma.policyConfig.create({
      data: { key: 'annualLeaveAccrualBasis', value: 'FISCAL_YEAR' as never, siteId: fixture.siteA.id, effectiveStartDate: new Date('2026-01-01') },
    });

    const migrateRes = await request(app.getHttpServer())
      .post('/admin/leave/accrual/migrate-to-fiscal-year')
      .set(auth(adminToken))
      .send({ siteId: fixture.siteA.id, asOfDate: '2026-01-01' });
    expect(migrateRes.status).toBe(201);
    expect(migrateRes.body.employeeIds).toContain(employee.id);

    const balancesAfter = await prisma.leaveBalance.findMany({ where: { employeeId: employee.id, leaveTypeId } });
    // 입사일 기준 옛 행(referencePeriod="2026-03-01")은 대체되고, 회계연도
    // 기준 새 행(referencePeriod="2026") 하나만 남는다.
    expect(balancesAfter).toHaveLength(1);
    const fiscalBalance = balancesAfter[0];
    expect(fiscalBalance.referencePeriod).toBe('2026');
    expect(fiscalBalance.grantedDays.toNumber()).toBe(17);
    expect(fiscalBalance.usedDays.toNumber()).toBe(5); // 기존 사용량 보존
    expect(fiscalBalance.effectiveDate.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(fiscalBalance.expiryDate.toISOString().slice(0, 10)).toBe('2026-12-31');

    // 감사 로그에 상태변경 이벤트가 남는다.
    const auditRow = await prisma.auditLog.findFirst({
      where: { eventType: 'ANNUAL_LEAVE_BASIS_MIGRATED', resourceId: employee.id },
    });
    expect(auditRow).not.toBeNull();

    // 재실행해도 같은 결과(멱등)다.
    const migrateAgain = await request(app.getHttpServer())
      .post('/admin/leave/accrual/migrate-to-fiscal-year')
      .set(auth(adminToken))
      .send({ siteId: fixture.siteA.id, asOfDate: '2026-01-01' });
    expect(migrateAgain.status).toBe(201);
    const balancesAfterAgain = await prisma.leaveBalance.findMany({ where: { employeeId: employee.id, leaveTypeId } });
    expect(balancesAfterAgain).toHaveLength(1);
    expect(balancesAfterAgain[0].grantedDays.toNumber()).toBe(17);
    expect(balancesAfterAgain[0].usedDays.toNumber()).toBe(5);
  }, 30000);

  it('재직자 연차 현황 조회는 ACTIVE 직원의 잔여 연차를 반환한다', async () => {
    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-fiscal-balances');
    const res = await request(app.getHttpServer())
      .get(`/admin/leave/balances?siteId=${fixture.siteA.id}&asOfDate=2026-06-01`)
      .set(auth(accessToken));
    expect(res.status).toBe(200);
    const row = res.body.find((r: { employeeNo: string }) => r.employeeNo === 'T-FISCAL-1');
    expect(row).toBeDefined();
    expect(row.remainingDays).toBe(12); // 17 발생(15+근속가산2) - 5 사용
  });
});
