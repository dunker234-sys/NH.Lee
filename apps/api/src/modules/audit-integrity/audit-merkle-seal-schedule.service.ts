import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AUDIT_MERKLE_SEAL_QUEUE_NAME, AuditMerkleSealJobData } from './queue.constants';

const HOURLY_JOB_ID = 'hourly-audit-merkle-seal';

/** BullMQ의 repeat 옵션을 쓴다 — 이 저장소의 유일한 스케줄링 수단(no-show-detection과 동일 컨벤션). */
@Injectable()
export class AuditMerkleSealScheduleService implements OnModuleInit {
  constructor(@InjectQueue(AUDIT_MERKLE_SEAL_QUEUE_NAME) private readonly queue: Queue<AuditMerkleSealJobData>) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs();
    if (existing.some((j) => j.id === HOURLY_JOB_ID)) return;

    // 매시 5분 — 정각 직후 지연 이벤트가 직전 시간대에 마저 들어올 여유를 둔다.
    await this.queue.add('seal-hour', {}, { repeat: { pattern: '5 * * * *', tz: 'Asia/Seoul' }, jobId: HOURLY_JOB_ID });
  }
}
