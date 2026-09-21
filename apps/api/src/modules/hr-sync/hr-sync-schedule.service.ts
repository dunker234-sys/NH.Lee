import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { HR_SYNC_QUEUE_NAME, HrSyncJobData } from './queue.constants';

const DAILY_JOB_ID = 'daily-hr-sync';

/** no-show-detection과 동일 패턴 — BullMQ repeat로 매일 새벽 1회 동기화한다. */
@Injectable()
export class HrSyncScheduleService implements OnModuleInit {
  constructor(@InjectQueue(HR_SYNC_QUEUE_NAME) private readonly queue: Queue<HrSyncJobData>) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs();
    if (existing.some((j) => j.id === DAILY_JOB_ID)) return;

    await this.queue.add(
      'sync-daily',
      { triggeredBy: 'SYSTEM' },
      { repeat: { pattern: '0 2 * * *', tz: 'Asia/Seoul' }, jobId: DAILY_JOB_ID },
    );
  }
}
