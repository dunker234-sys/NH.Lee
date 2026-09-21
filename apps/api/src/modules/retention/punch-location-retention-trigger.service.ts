import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PUNCH_LOCATION_RETENTION_QUEUE_NAME, PunchLocationRetentionJobData } from './queue.constants';

/**
 * ConsentService.withdraw()(§24④ 철회 시 지체없는 파기)가 동의 처리
 * 자체의 커넥션 풀과 경쟁하지 않도록, 실제 삭제는 이 트리거를 거쳐 별도
 * 큐로 넘긴다(weekly-alert-trigger.service.ts와 동일한 얇은 트리거 패턴).
 * 완전 동기 처리는 HTTP 응답을 지연시키므로 채택하지 않는다 — 큐 적재
 * 자체가 "지체없이"를 만족한다(정기 스윕의 최대 24시간 지연과 달리
 * 즉시 처리 경로).
 */
@Injectable()
export class PunchLocationRetentionTriggerService {
  constructor(@InjectQueue(PUNCH_LOCATION_RETENTION_QUEUE_NAME) private readonly queue: Queue<PunchLocationRetentionJobData>) {}

  async onConsentWithdrawn(employeeId: string): Promise<void> {
    await this.queue.add('purge-employee-immediate', { employeeId }, { jobId: `withdraw-${employeeId}-${Date.now()}` });
  }
}
