import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { HR_SYNC_QUEUE_NAME, HrSyncJobData } from './queue.constants';

/** 관리자 수동 즉시실행 진입점 — 야간 배치와 동일 코드 경로(컨슈머)를 탄다. */
@Injectable()
export class HrSyncTriggerService {
  constructor(@InjectQueue(HR_SYNC_QUEUE_NAME) private readonly queue: Queue<HrSyncJobData>) {}

  async triggerNow(asOfDate: string): Promise<void> {
    await this.queue.add(
      'sync-manual',
      { asOfDate, triggeredBy: 'MANUAL' },
      { jobId: `manual-${asOfDate}-${Date.now()}` },
    );
  }
}
