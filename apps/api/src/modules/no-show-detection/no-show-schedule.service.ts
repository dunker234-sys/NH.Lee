import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NO_SHOW_DETECTION_QUEUE_NAME, NoShowDetectionJobData } from './queue.constants';

const DAILY_JOB_ID = 'daily-no-show-detection';

/**
 * 신규 cron 라이브러리를 추가하지 않는다 — BullMQ가 이미 repeat 옵션을
 * 내장 지원하고, 이 저장소의 유일한 스케줄링 수단이다(STEP3.5부터 확립).
 */
@Injectable()
export class NoShowScheduleService implements OnModuleInit {
  constructor(@InjectQueue(NO_SHOW_DETECTION_QUEUE_NAME) private readonly queue: Queue<NoShowDetectionJobData>) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs();
    if (existing.some((j) => j.id === DAILY_JOB_ID)) return;

    await this.queue.add(
      'detect-daily',
      {},
      { repeat: { pattern: '0 1 * * *', tz: 'Asia/Seoul' }, jobId: DAILY_JOB_ID },
    );
  }
}
