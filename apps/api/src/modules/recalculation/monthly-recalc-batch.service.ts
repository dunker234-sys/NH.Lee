import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  MONTHLY_RECALC_BATCH_QUEUE_NAME,
  MonthlyRecalcBatchJobData,
  monthlyRecalcBatchJobId,
} from './monthly-recalc-batch.queue.constants';

export interface EnqueueMonthlyRecalcBatchResult {
  enqueuedCount: number;
}

export interface RetryFailedMonthlyRecalcResult {
  retriedJobIds: string[];
}

/**
 * STEP12: weekly-recalc-batch.service.ts와 동일한 구조 — 전 재직 직원(전사)
 * 단위로 (직원, 월) 잡을 하나씩 별도 큐에 적재한다. RECALCULATION_QUEUE_NAME
 * (실시간)·WEEKLY_RECALC_BATCH_QUEUE_NAME(야간 주간 배치)과 물리적으로
 * 분리해 커넥션 풀 경합을 피한다.
 */
@Injectable()
export class MonthlyRecalcBatchService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(MONTHLY_RECALC_BATCH_QUEUE_NAME) private readonly queue: Queue<MonthlyRecalcBatchJobData>,
  ) {}

  async enqueueForAllActiveEmployees(yearMonth: string): Promise<EnqueueMonthlyRecalcBatchResult> {
    const employees = await this.prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    for (const { id: employeeId } of employees) {
      await this.queue.add(
        'recalculate-month',
        { employeeId, yearMonth },
        { jobId: monthlyRecalcBatchJobId(employeeId, yearMonth) },
      );
    }

    return { enqueuedCount: employees.length };
  }

  async retryFailedJobs(): Promise<RetryFailedMonthlyRecalcResult> {
    const failedJobs = await this.queue.getFailed();
    const retriedJobIds: string[] = [];
    for (const job of failedJobs) {
      await job.retry();
      if (job.id) retriedJobIds.push(job.id);
    }
    return { retriedJobIds };
  }
}
