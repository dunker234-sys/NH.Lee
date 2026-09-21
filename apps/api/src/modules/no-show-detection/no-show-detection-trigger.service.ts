import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NO_SHOW_DETECTION_QUEUE_NAME, NoShowDetectionJobData } from './queue.constants';

/** 수동/테스트 트리거 — 특정 날짜를 즉시 감지 대상으로 큐에 적재한다. */
@Injectable()
export class NoShowDetectionTriggerService {
  constructor(@InjectQueue(NO_SHOW_DETECTION_QUEUE_NAME) private readonly queue: Queue<NoShowDetectionJobData>) {}

  async triggerForDate(workDate: string): Promise<void> {
    await this.queue.add('detect-manual', { workDate }, { jobId: `manual-${workDate}-${Date.now()}` });
  }
}
