import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from '../src/modules/notifications/queue.constants';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import {
  Fixture,
  loadFixture,
  loadPolicyConfigFixture,
  loadSchedulePolicyConfigFixture,
  loadPayrollPolicyConfigFixture,
} from './fixtures';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function workDateOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * STEP11 완료조건 통합 검증:
 * (1) 미승인 실적이 남은 사업장은 마감이 차단된다
 * (2) 마감→산출→내보내기→재마감 흐름이 통합 테스트로 검증된다
 * (3) 재마감 차분 리포트가 변경된 근로자·항목·차이값을 정확히 표시한다
 * (4) 일용직 레이아웃이 별도로 산출된다
 */
describe('급여 마감 전체 생애주기 (STEP11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let notificationsQueue: Queue<NotificationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadSchedulePolicyConfigFixture();
    await loadPayrollPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    notificationsQueue = app.get<Queue<NotificationJobData>>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
    // 마감 단계 전이(submit/approve)가 실제로 NotificationService.notify()를
    // 태워 알림 큐에 잡을 올린다 — 이 스펙은 알림 발송 성공 여부를 검증하지
    // 않으므로, 이전 실행의 잔여 잡이 이번 실행의 alertLog와 어긋나 워커
    // 오류로 번지는 것을 막기 위해 시작 전에 비운다(STEP9 e2e들의 기존 관례).
    await notificationsQueue.obliterate({ force: true });
  }, 60000);

  afterAll(async () => {
    // obliterate가 그 순간 워커가 실제 처리 중인 잡까지 강제 삭제하면 워커가
    // "처리 완료"로 전환하지 못해 노이즈성 lock 에러가 난다(punches-p95
    // e2e에서 실측으로 확인한 문제와 동일 원인) — active count가 빠질 때까지
    // 짧게 기다린 뒤에만 비운다.
    const deadline = Date.now() + 15000;
    while ((await notificationsQueue.getActiveCount()) > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await notificationsQueue.obliterate({ force: true });
    await app.close();
  });

  it('미승인 실적이 남은 사업장은 마감(submit)이 차단된다', async () => {
    const yearMonth = '2026-06';
    const employee = await prisma.employee.create({
      data: {
        employeeNo: 'T-PAYROLL-BLOCK',
        name: '테스트-마감차단',
        employmentType: 'REGULAR',
        hireDate: workDateOf('2024-01-01'),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });
    await prisma.attendanceDaily.create({
      data: {
        employeeId: employee.id,
        siteId: fixture.siteA.id,
        workDate: workDateOf('2026-06-05'),
        actualWorkMinutes: 480,
        status: 'UNAPPROVED_ACTUAL',
        inputSnapshotHash: 'test-block',
        breakdown: [],
      },
    });

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-payroll-block');
    const res = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/submit`)
      .set(auth(accessToken));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PAYROLL_CLOSE_BLOCKED');
  });

  it('마감(submit→approve→finalize)→산출(월급제/일용직)→내보내기→재마감 차분 리포트까지 전체 흐름이 동작한다', async () => {
    const yearMonth = '2026-05';

    const monthlyEmployee = await prisma.employee.create({
      data: {
        employeeNo: 'T-PAYROLL-MONTHLY',
        name: '테스트-월급제',
        employmentType: 'REGULAR',
        hireDate: workDateOf('2024-01-01'),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });
    const dailyEmployee = await prisma.employee.create({
      data: {
        employeeNo: 'T-PAYROLL-DAILY',
        name: '테스트-일용직',
        employmentType: 'DAILY',
        hireDate: workDateOf('2024-01-01'),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });

    for (const [dayNum, overtimeMinutes] of [
      ['04', 0],
      ['05', 60],
      ['06', 0],
    ] as const) {
      await prisma.attendanceDaily.create({
        data: {
          employeeId: monthlyEmployee.id,
          siteId: fixture.siteA.id,
          workDate: workDateOf(`2026-05-${dayNum}`),
          scheduledWorkMinutes: 480,
          actualWorkMinutes: 480 + overtimeMinutes,
          approvedOvertimeMinutes: overtimeMinutes,
          status: 'NORMAL',
          inputSnapshotHash: `test-monthly-${dayNum}`,
          breakdown: [],
        },
      });
      await prisma.attendanceDaily.create({
        data: {
          employeeId: dailyEmployee.id,
          siteId: fixture.siteA.id,
          workDate: workDateOf(`2026-05-${dayNum}`),
          scheduledWorkMinutes: 480,
          actualWorkMinutes: 480,
          status: 'NORMAL',
          inputSnapshotHash: `test-daily-${dayNum}`,
          breakdown: [],
        },
      });
    }

    const { accessToken: hqHrToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-payroll-hqhr');
    await request(app.getHttpServer())
      .post(`/admin/employees/${monthlyEmployee.id}/wage-rate`)
      .set(auth(hqHrToken))
      .send({ wageType: 'MONTHLY', baseAmount: 2093000, effectiveStartDate: '2024-01-01' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/employees/${dailyEmployee.id}/wage-rate`)
      .set(auth(hqHrToken))
      .send({ wageType: 'HOURLY', baseAmount: 10000, effectiveStartDate: '2024-01-01' })
      .expect(201);

    // 1) submit(사업장)
    const { accessToken: siteManagerToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-payroll-submit');
    const submitRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/submit`)
      .set(auth(siteManagerToken));
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.stage).toBe('SITE_SUBMITTED');

    // 2) 마감 전 자동 검증 실행 + 확인
    const validateRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/validation/run`)
      .set(auth(hqHrToken));
    expect(validateRes.status).toBe(201);
    expect(validateRes.body.blockingCount).toBe(0);

    const ackRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/validation/acknowledge`)
      .set(auth(hqHrToken))
      .send({ reportId: validateRes.body.reportId });
    expect(ackRes.status).toBe(201);

    // 3) approve(권역)
    const { accessToken: regionalToken } = await login(app, fixture.employees.regional.employeeNo, fixture.password, 'dev-payroll-approve');
    const approveRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/approve`)
      .set(auth(regionalToken));
    expect(approveRes.status).toBe(201);
    expect(approveRes.body.stage).toBe('REGION_APPROVED');

    // 4) finalize(본사) — attendance_daily가 LOCKED로 전환된다
    const finalizeRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/finalize`)
      .set(auth(hqHrToken));
    expect(finalizeRes.status).toBe(201);
    expect(finalizeRes.body.stage).toBe('HQ_FINALIZED');
    expect(finalizeRes.body.status).toBe('CLOSED');
    expect(finalizeRes.body.version).toBe(1);

    const lockedRow = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId: monthlyEmployee.id, workDate: workDateOf('2026-05-04') } },
    });
    expect(lockedRow.status).toBe('LOCKED');

    // 5) 산출(compute) — 월급제는 1행, 일용직은 일자별 N행
    const computeRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/statement/compute`)
      .set(auth(hqHrToken));
    expect(computeRes.status).toBe(201);

    const monthlyItems = await prisma.payrollStatementItem.findMany({ where: { payrollCloseId: (await getCloseId()), employeeId: monthlyEmployee.id } });
    expect(monthlyItems).toHaveLength(1);
    expect(monthlyItems[0].layoutType).toBe('MONTHLY');
    expect(monthlyItems[0].approvedOvertimeMinutes).toBe(60);
    expect(monthlyItems[0].unapprovedOvertimeMinutes).toBe(0);
    expect(Number(monthlyItems[0].basePayAmount)).toBe(2093000);

    const dailyItems = await prisma.payrollStatementItem.findMany({
      where: { payrollCloseId: await getCloseId(), employeeId: dailyEmployee.id },
      orderBy: { workDate: 'asc' },
    });
    expect(dailyItems).toHaveLength(3);
    expect(dailyItems.every((i) => i.layoutType === 'DAILY')).toBe(true);
    expect(dailyItems.every((i) => i.workDate !== null)).toBe(true);

    async function getCloseId(): Promise<string> {
      const close = await prisma.payrollClose.findUniqueOrThrow({ where: { siteId_periodYearMonth: { siteId: fixture.siteA.id, periodYearMonth: yearMonth } } });
      return close.id;
    }

    // 6) 내보내기(EXCEL/CSV) — 파일이 만들어지고 전송 이력이 남는다
    const excelRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/export`)
      .set(auth(hqHrToken))
      .send({ format: 'EXCEL' });
    expect(excelRes.status).toBe(201);
    expect(excelRes.headers['content-type']).toContain('spreadsheetml');

    const csvRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/export`)
      .set(auth(hqHrToken))
      .send({ format: 'CSV' });
    expect(csvRes.status).toBe(201);
    expect(csvRes.text).toContain('사번');

    const historyRes = await request(app.getHttpServer())
      .get(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/export/history`)
      .set(auth(hqHrToken));
    expect(historyRes.body).toHaveLength(2);

    // 7) 마감취소(reopen) → 정정 반영(승인 연장시간 변경) → 재마감
    const reopenRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/reopen`)
      .set(auth(hqHrToken))
      .send({ reason: '연장근로시간 정정 반영을 위한 마감취소' });
    expect(reopenRes.status).toBe(201);
    expect(reopenRes.body.stage).toBe('NOT_STARTED');
    expect(reopenRes.body.status).toBe('OPEN');

    await prisma.attendanceDaily.update({
      where: { employeeId_workDate: { employeeId: monthlyEmployee.id, workDate: workDateOf('2026-05-05') } },
      data: { approvedOvertimeMinutes: 120, actualWorkMinutes: 600, status: 'NORMAL' },
    });

    await request(app.getHttpServer()).post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/submit`).set(auth(siteManagerToken)).expect(201);
    const revalidateRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/validation/run`)
      .set(auth(hqHrToken));
    await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/validation/acknowledge`)
      .set(auth(hqHrToken))
      .send({ reportId: revalidateRes.body.reportId })
      .expect(201);
    await request(app.getHttpServer()).post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/approve`).set(auth(regionalToken)).expect(201);
    const refinalizeRes = await request(app.getHttpServer()).post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/finalize`).set(auth(hqHrToken));
    expect(refinalizeRes.status).toBe(201);
    expect(refinalizeRes.body.version).toBe(2);

    const recomputeRes = await request(app.getHttpServer())
      .post(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/statement/compute`)
      .set(auth(hqHrToken));
    expect(recomputeRes.status).toBe(201);
    expect(recomputeRes.body.changedEmployeeCount).toBeGreaterThanOrEqual(1);

    // 8) 재마감 차분 리포트 — 변경된 근로자·항목·차이값이 정확히 표시된다
    const diffRes = await request(app.getHttpServer())
      .get(`/admin/payroll-close/${fixture.siteA.id}/${yearMonth}/diff?fromVersion=2&toVersion=2`)
      .set(auth(hqHrToken));
    expect(diffRes.status).toBe(200);
    const recloseBatch = diffRes.body.find((b: { batchType: string }) => b.batchType === 'RECLOSE');
    expect(recloseBatch).toBeDefined();
    const changedRow = recloseBatch.rows.find((r: { employeeId: string }) => r.employeeId === monthlyEmployee.id);
    expect(changedRow).toBeDefined();
    expect(changedRow.changeType).toBe('CHANGED');
    expect(changedRow.changedFields).toEqual(expect.arrayContaining(['approvedOvertimeMinutes']));
    expect(changedRow.beforeValue.approvedOvertimeMinutes).toBe(60);
    expect(changedRow.afterValue.approvedOvertimeMinutes).toBe(120);
  }, 60000);
});
