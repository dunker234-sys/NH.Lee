import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AuditMerkleSealService } from './audit-merkle-seal.service';
import { AUDIT_MERKLE_SEAL_QUEUE_NAME, AuditMerkleSealJobData } from './queue.constants';

@Processor(AUDIT_MERKLE_SEAL_QUEUE_NAME)
export class AuditMerkleSealConsumer extends WorkerHost {
  private readonly logger = new Logger(AuditMerkleSealConsumer.name);

  constructor(private readonly sealService: AuditMerkleSealService) {
    super();
  }

  async process(job: Job<AuditMerkleSealJobData>): Promise<void> {
    const periodStart = job.data.periodStart ? new Date(job.data.periodStart) : this.previousFullHour();
    await this.sealService.sealHour(periodStart);
  }

  /** BullMQ Worker의 'error' 이벤트(예: 강제 obliterate된 잡의 잠금 갱신
   * 실패)는 리스너가 없으면 Node가 uncaught exception으로 취급해 프로세스
   * 크래시로 이어질 수 있다 — 반드시 하나는 등록해 둔다. */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`BullMQ worker error: ${err.message}`, err.stack);
  }

  /** 아직 진행 중인 시간대를 봉인하면 그 뒤 이벤트가 이미 봉인된 시간대에
   * 더 들어오는 사태가 생긴다 — "지금"이 속한 시가 아니라 그 직전 시를 봉인한다. */
  private previousFullHour(): Date {
    const now = new Date();
    const flooredNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0));
    return new Date(flooredNow.getTime() - 60 * 60 * 1000);
  }
}
