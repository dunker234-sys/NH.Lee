import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  WEEKLY_RECALC_BATCH_QUEUE_NAME,
  WeeklyRecalcBatchJobData,
  weeklyRecalcBatchJobId,
} from './weekly-recalc-batch.queue.constants';

export interface EnqueueWeeklyRecalcBatchResult {
  enqueuedCount: number;
}

export interface RetryFailedWeeklyRecalcResult {
  retriedJobIds: string[];
}

/**
 * 요구사항서 4.4②·⑥의 "매일 야간 정합성 배치"·"주간 집계 재계산" 전용
 * 팬아웃. 사업장별이 아니라 전 재직 직원(전사) 단위로 (직원, 주) 잡을
 * 하나씩 큐에 적재한다 — RECALCULATION_QUEUE_NAME(타각 시 (직원,일) 단위
 * 실시간 잡)과는 물리적으로 분리된 큐다: 실시간 경로와 야간 배치가 같은
 * 커넥션 풀 예산을 두고 경쟁하지 않게 하기 위해서다.
 *
 * (사번×일자) 대신 (사번×주) 체크포인트를 쓴다 — 이 배치가 갱신하는
 * 단위가 attendance_weekly(주 단위)이기 때문이다. 잡 ID가 곧 체크포인트고,
 * 실패한 잡은 BullMQ 네이티브 failed 목록에 남아 그 자체가 DLQ다
 * (RecalculationOpsService.retryFailedJobs()와 같은 패턴).
 */
@Injectable()
export class WeeklyRecalcBatchService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WEEKLY_RECALC_BATCH_QUEUE_NAME) private readonly queue: Queue<WeeklyRecalcBatchJobData>,
  ) {}

  async enqueueForAllActiveEmployees(weekStartDate: string): Promise<EnqueueWeeklyRecalcBatchResult> {
    const employees = await this.prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    for (const { id: employeeId } of employees) {
      await this.queue.add(
        'recalculate-week',
        { employeeId, weekStartDate },
        { jobId: weeklyRecalcBatchJobId(employeeId, weekStartDate) },
      );
    }

    return { enqueuedCount: employees.length };
  }

  async retryFailedJobs(): Promise<RetryFailedWeeklyRecalcResult> {
    const failedJobs = await this.queue.getFailed();
    const retriedJobIds: string[] = [];
    for (const job of failedJobs) {
      await job.retry();
      if (job.id) retriedJobIds.push(job.id);
    }
    return { retriedJobIds };
  }
}
