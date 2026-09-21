import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from './queue.constants';

export interface RetryFailedJobsResult {
  retriedJobIds: string[];
}

/**
 * BullMQ의 네이티브 failed 목록이 곧 DLQ다(별도 큐 없음). 부분 실패한 잡을
 * 재시도해 그 날짜만 재처리하고 나머지는 건드리지 않는다.
 */
@Injectable()
export class RecalculationOpsService {
  constructor(@InjectQueue(RECALCULATION_QUEUE_NAME) private readonly queue: Queue<RecalculationJobData>) {}

  async retryFailedJobs(): Promise<RetryFailedJobsResult> {
    const failedJobs = await this.queue.getFailed();
    const retriedJobIds: string[] = [];
    for (const job of failedJobs) {
      await job.retry();
      if (job.id) retriedJobIds.push(job.id);
    }
    return { retriedJobIds };
  }
}
