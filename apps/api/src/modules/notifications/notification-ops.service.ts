import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from './queue.constants';

export interface RetryFailedJobsResult {
  retriedJobIds: string[];
}

/** BullMQ의 네이티브 failed 목록이 곧 DLQ다(별도 큐 없음). RecalculationOpsService와 대칭. */
@Injectable()
export class NotificationOpsService {
  constructor(@InjectQueue(NOTIFICATIONS_QUEUE_NAME) private readonly queue: Queue<NotificationJobData>) {}

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
