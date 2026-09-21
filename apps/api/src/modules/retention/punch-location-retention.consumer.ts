import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SystemContextService } from '../../common/principal/system-context.service';
import { PunchLocationRetentionService } from './punch-location-retention.service';
import { PUNCH_LOCATION_RETENTION_QUEUE_NAME, PunchLocationRetentionJobData } from './queue.constants';

/** 삭제 배치라 동시성이 필요 없다 — 청크 루프 자체가 이미 순차적이다. */
@Processor(PUNCH_LOCATION_RETENTION_QUEUE_NAME, { concurrency: 1 })
export class PunchLocationRetentionConsumer extends WorkerHost {
  private readonly logger = new Logger(PunchLocationRetentionConsumer.name);

  constructor(
    private readonly retentionService: PunchLocationRetentionService,
    private readonly systemContext: SystemContextService,
  ) {
    super();
  }

  async process(job: Job<PunchLocationRetentionJobData>): Promise<void> {
    await this.systemContext.runAsSystem('punch_location', async () => {
      if (job.name === 'purge-employee-immediate' && job.data.employeeId) {
        await this.retentionService.purgeForEmployee(job.data.employeeId);
        return;
      }
      await this.retentionService.purgeDue();
    });
  }

  /** BullMQ Worker의 'error' 이벤트는 리스너가 없으면 Node가 uncaught
   * exception으로 취급해 프로세스 크래시로 이어질 수 있다 — 반드시 하나는
   * 등록해 둔다. */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`BullMQ worker error: ${err.message}`, err.stack);
  }
}
