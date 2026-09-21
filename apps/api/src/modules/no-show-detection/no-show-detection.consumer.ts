import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SystemContextService } from '../../common/principal/system-context.service';
import { NoShowDetectionService } from './no-show-detection.service';
import { NO_SHOW_DETECTION_QUEUE_NAME, NoShowDetectionJobData } from './queue.constants';

@Processor(NO_SHOW_DETECTION_QUEUE_NAME)
export class NoShowDetectionConsumer extends WorkerHost {
  private readonly logger = new Logger(NoShowDetectionConsumer.name);

  constructor(
    private readonly noShowDetectionService: NoShowDetectionService,
    private readonly systemContext: SystemContextService,
  ) {
    super();
  }

  async process(job: Job<NoShowDetectionJobData>): Promise<void> {
    const workDate = job.data.workDate ?? this.yesterdayKst();
    await this.systemContext.runAsSystem('no_show_notification_target', () =>
      this.noShowDetectionService.detectForDate(workDate),
    );
  }

  /** BullMQ Worker의 'error' 이벤트는 리스너가 없으면 Node가 uncaught
   * exception으로 취급해 프로세스 크래시로 이어질 수 있다 — 반드시 하나는
   * 등록해 둔다. */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`BullMQ worker error: ${err.message}`, err.stack);
  }

  private yesterdayKst(): string {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    kst.setUTCDate(kst.getUTCDate() - 1);
    return kst.toISOString().slice(0, 10);
  }
}
