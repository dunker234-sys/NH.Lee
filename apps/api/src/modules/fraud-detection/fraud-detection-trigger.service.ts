import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { FRAUD_DETECTION_QUEUE_NAME, FraudDetectionJobData } from './queue.constants';

@Injectable()
export class FraudDetectionTriggerService {
  constructor(@InjectQueue(FRAUD_DETECTION_QUEUE_NAME) private readonly queue: Queue<FraudDetectionJobData>) {}

  async onPunchSaved(punchId: string, employeeId: string): Promise<void> {
    // punchId(UUID)가 그대로 잡 ID다 — 같은 타각에 대한 재탐지 요청은 자연 중복제거된다.
    await this.queue.add('detect', { punchId, employeeId }, { jobId: punchId });
  }
}
