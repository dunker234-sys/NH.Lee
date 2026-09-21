import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { HrSyncTriggerType } from '@prisma/client';
import { SystemContextService } from '../../common/principal/system-context.service';
import { HrSyncService } from './hr-sync.service';
import { HR_SYNC_QUEUE_NAME, HrSyncJobData } from './queue.constants';

@Processor(HR_SYNC_QUEUE_NAME)
export class HrSyncConsumer extends WorkerHost {
  private readonly logger = new Logger(HrSyncConsumer.name);

  constructor(
    private readonly hrSyncService: HrSyncService,
    private readonly systemContext: SystemContextService,
  ) {
    super();
  }

  async process(job: Job<HrSyncJobData>): Promise<void> {
    const asOfDate = job.data.asOfDate ?? this.todayKst();
    await this.systemContext.runAsSystem('employee', () =>
      this.hrSyncService.run(asOfDate, job.data.triggeredBy as HrSyncTriggerType),
    );
  }

  /** BullMQ Worker의 'error' 이벤트는 리스너가 없으면 Node가 uncaught
   * exception으로 취급해 프로세스 크래시로 이어질 수 있다 — 반드시 하나는
   * 등록해 둔다(punches-p95 e2e에서 recalc/fraud 큐를 강제 obliterate할 때
   * 실제로 관찰된 문제 — 이 큐도 동일 위험이 있어 함께 고친다). */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`BullMQ worker error: ${err.message}`, err.stack);
  }

  private todayKst(): string {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }
}
