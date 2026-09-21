import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EmploymentType, Prisma } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MonthlyRecalcBatchService } from '../src/modules/recalculation/monthly-recalc-batch.service';
import {
  MONTHLY_RECALC_BATCH_QUEUE_NAME,
  MonthlyRecalcBatchJobData,
} from '../src/modules/recalculation/monthly-recalc-batch.queue.constants';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import { Fixture, loadFixture, loadPolicyConfigFixture } from './fixtures';

const EMPLOYEE_COUNT = 3736;

/**
 * STEP12 완료조건("월 배치 30분 확인"): 3,736명 규모 월간 재계산 완전성
 * 재검증이 30분 이내. weekly-recalc-batch-performance.e2e-spec.ts와 동일한
 * 관례 — 실제 타각/스케줄 없이 팬아웃→recalculateMonth()→attendance_monthly
 * upsert 파이프라인 자체의 처리량을 측정한다. recalculateMonth()의 단위
 * 작업(해당 월 attendance_daily 조회+reduce+upsert 1회)이 recalculateWeek()
 * 보다 가벼워, 같은 팬아웃 규모·동시성(10)에서 weekly 실측치 이하로 수렴할
 * 것으로 예상된다 — 그래서 assertion 상한은 30분이지만 실제 실행은 그보다
 * 훨씬 짧게 끝난다(폴링이 완료 즉시 루프를 빠져나간다).
 */
describe('MonthlyRecalcBatchService — STEP12 3,736명 월간 재계산 성능', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let batchService: MonthlyRecalcBatchService;
  let queue: Queue<MonthlyRecalcBatchJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    batchService = app.get(MonthlyRecalcBatchService);
    queue = app.get<Queue<MonthlyRecalcBatchJobData>>(getQueueToken(MONTHLY_RECALC_BATCH_QUEUE_NAME));

    const rows: Prisma.EmployeeCreateManyInput[] = Array.from({ length: EMPLOYEE_COUNT }, (_, i) => ({
      employeeNo: `T-MPERF-${String(i).padStart(5, '0')}`,
      name: `월간성능테스트-${i}`,
      employmentType: 'REGULAR' as EmploymentType,
      hireDate: new Date('2024-01-01'),
      primarySiteId: fixture.siteA.id,
      role: 'EMPLOYEE',
    }));
    for (let i = 0; i < rows.length; i += 1000) {
      await adminPrisma.employee.createMany({ data: rows.slice(i, i + 1000) });
    }
  }, 120000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await app.close();
  });

  it(`전 재직 직원(약 ${EMPLOYEE_COUNT}명) 월간 재계산이 30분 이내 완료된다`, async () => {
    const yearMonth = '2026-03';
    const totalActiveEmployees = await prisma.employee.count({ where: { status: 'ACTIVE' } });

    const start = performance.now();
    const { enqueuedCount } = await batchService.enqueueForAllActiveEmployees(yearMonth);
    expect(enqueuedCount).toBe(totalActiveEmployees);

    // 폴링: attendance_monthly 행 수가 전체 재직 직원 수에 도달할 때까지 기다린다.
    const deadline = Date.now() + 1_800_000;
    let completedCount = 0;
    for (;;) {
      completedCount = await prisma.attendanceMonthly.count({ where: { yearMonth } });
      if (completedCount >= totalActiveEmployees) break;
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const elapsedMs = performance.now() - start;

    // eslint-disable-next-line no-console
    console.log(
      `[monthly-recalc-batch 성능] ${totalActiveEmployees}명 팬아웃+처리: ${elapsedMs.toFixed(0)}ms ` +
        `(완료 ${completedCount}/${totalActiveEmployees})`,
    );

    expect(completedCount).toBe(totalActiveEmployees);
    expect(elapsedMs).toBeLessThan(1_800_000);
  }, 1_900_000);
});
