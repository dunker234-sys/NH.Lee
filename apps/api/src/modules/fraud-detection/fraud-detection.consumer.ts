import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SystemContextService } from '../../common/principal/system-context.service';
import { FraudDetectionService } from './fraud-detection.service';
import { FRAUD_DETECTION_QUEUE_NAME, FraudDetectionJobData } from './queue.constants';

/**
 * 동일 기기 다수 사번 탐지는 다른 직원의 punch_raw까지 조회해야 해서 SYSTEM
 * 주체로 실행한다(recalculation 모듈의 컨슈머와 동일한 패턴).
 */
@Processor(FRAUD_DETECTION_QUEUE_NAME, { concurrency: 5 })
export class FraudDetectionConsumer extends WorkerHost {
  private readonly logger = new Logger(FraudDetectionConsumer.name);

  constructor(
    private readonly fraudDetectionService: FraudDetectionService,
    private readonly systemContext: SystemContextService,
  ) {
    super();
  }

  async process(job: Job<FraudDetectionJobData>): Promise<void> {
    const { punchId } = job.data;
    await this.systemContext.runAsSystem('punch_fraud_signal', () => this.fraudDetectionService.detectForPunch(punchId));
  }

  /** BullMQ Worker의 'error' 이벤트(예: 강제 obliterate된 잡의 잠금 갱신
   * 실패)는 리스너가 없으면 Node가 uncaught exception으로 취급해 프로세스
   * 크래시로 이어질 수 있다 — 반드시 하나는 등록해 둔다. */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`BullMQ worker error: ${err.message}`, err.stack);
  }
}
