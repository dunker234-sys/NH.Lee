import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EmploymentType, Prisma } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { WeeklyRecalcBatchService } from '../src/modules/recalculation/weekly-recalc-batch.service';
import {
  WEEKLY_RECALC_BATCH_QUEUE_NAME,
  WeeklyRecalcBatchJobData,
} from '../src/modules/recalculation/weekly-recalc-batch.queue.constants';
import { dateOnly } from '../src/common/time/week.util';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadWeeklyAlertPolicyConfigFixture } from './fixtures';

const EMPLOYEE_COUNT = 3736;

/**
 * 완료조건(요구사항서 4.4⑥): 3,736명 규모 주간 재계산이 5분 이내.
 * schedule-roster-generation-timing.e2e-spec.ts와 같은 관례 — 스펙 로컬로
 * 대량 데이터를 만들고 performance.now()로 실측한다. 실제 타각/스케줄
 * 데이터 없이 순수하게 "전 재직 직원 팬아웃 → recalculateWeek() 실행 →
 * attendance_weekly upsert" 파이프라인 자체의 처리량을 측정한다 — 이
 * 파이프라인이 이미 지수적으로 무거운 부분(정책 조회·스케줄 조회 등)을
 * 전부 실행하므로, 실적 데이터가 비어 있어도 유의미한 처리량 측정이 된다.
 */
describe('WeeklyRecalcBatchService — 요구사항서 4.4⑥ 3,736명 주간 재계산 성능', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let batchService: WeeklyRecalcBatchService;
  let queue: Queue<WeeklyRecalcBatchJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadWeeklyAlertPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    batchService = app.get(WeeklyRecalcBatchService);
    queue = app.get<Queue<WeeklyRecalcBatchJobData>>(getQueueToken(WEEKLY_RECALC_BATCH_QUEUE_NAME));

    const rows: Prisma.EmployeeCreateManyInput[] = Array.from({ length: EMPLOYEE_COUNT }, (_, i) => ({
      employeeNo: `T-PERF-${String(i).padStart(5, '0')}`,
      name: `성능테스트-${i}`,
      employmentType: 'REGULAR' as EmploymentType,
      hireDate: new Date('2024-01-01'),
      primarySiteId: fixture.siteA.id,
      role: 'EMPLOYEE',
    }));
    // 실제 타각/스케줄 없이 재직 직원만 대량 생성 — createMany로 단일 벌크 인서트.
    for (let i = 0; i < rows.length; i += 1000) {
      await adminPrisma.employee.createMany({ data: rows.slice(i, i + 1000) });
    }
  }, 120000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await app.close();
  });

  it(`전 재직 직원(약 ${EMPLOYEE_COUNT}명) 주간 재계산이 5분 이내 완료된다`, async () => {
    const weekStartDate = '2026-03-16';
    const totalActiveEmployees = await prisma.employee.count({ where: { status: 'ACTIVE' } });

    const start = performance.now();
    const { enqueuedCount } = await batchService.enqueueForAllActiveEmployees(weekStartDate);
    expect(enqueuedCount).toBe(totalActiveEmployees);

    // 폴링: attendance_weekly 행 수가 전체 재직 직원 수에 도달할 때까지 기다린다.
    const deadline = Date.now() + 300000;
    let completedCount = 0;
    for (;;) {
      completedCount = await prisma.attendanceWeekly.count({ where: { weekStartDate: dateOnly(weekStartDate) } });
      if (completedCount >= totalActiveEmployees) break;
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const elapsedMs = performance.now() - start;

    // eslint-disable-next-line no-console
    console.log(
      `[weekly-recalc-batch 성능] ${totalActiveEmployees}명 팬아웃+처리: ${elapsedMs.toFixed(0)}ms ` +
        `(완료 ${completedCount}/${totalActiveEmployees})`,
    );

    expect(completedCount).toBe(totalActiveEmployees);
    expect(elapsedMs).toBeLessThan(300000);
  }, 320000);
});
