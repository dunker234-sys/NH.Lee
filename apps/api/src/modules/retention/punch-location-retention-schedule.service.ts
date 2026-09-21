import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PUNCH_LOCATION_RETENTION_QUEUE_NAME, PunchLocationRetentionJobData } from './queue.constants';

const DAILY_JOB_ID = 'daily-punch-location-retention';

/**
 * no-show-schedule.service.ts와 동일한 관례 — 신규 cron 라이브러리를 쓰지
 * 않는다. 매일 03:00 KST(새벽 배치 시간대, 타각 실시간 트래픽과 겹치지 않음).
 */
@Injectable()
export class PunchLocationRetentionScheduleService implements OnModuleInit {
  constructor(@InjectQueue(PUNCH_LOCATION_RETENTION_QUEUE_NAME) private readonly queue: Queue<PunchLocationRetentionJobData>) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs();
    if (existing.some((j) => j.id === DAILY_JOB_ID)) return;

    await this.queue.add('purge-due', {}, { repeat: { pattern: '0 3 * * *', tz: 'Asia/Seoul' }, jobId: DAILY_JOB_ID });
  }
}
