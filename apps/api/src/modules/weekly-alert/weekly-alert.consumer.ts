import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WeeklyOvertimeAlertService } from './weekly-overtime-alert.service';
import { WEEKLY_ALERT_QUEUE_NAME, WeeklyAlertJobData } from './queue.constants';

/**
 * concurrency를 낮게 둔다(2) — RECALCULATION_QUEUE_NAME(concurrency 5)과
 * 같은 Postgres 커넥션 풀을 공유하므로, 두 큐의 동시 부하 합이 풀 용량을
 * 넘지 않도록 보수적으로 잡는다. 알림은 근태 산출만큼 지연에 민감하지
 * 않다(수 초 지연이 문제되지 않는다).
 */
@Processor(WEEKLY_ALERT_QUEUE_NAME, { concurrency: 2 })
export class WeeklyAlertConsumer extends WorkerHost {
  private readonly logger = new Logger(WeeklyAlertConsumer.name);

  constructor(private readonly weeklyOvertimeAlertService: WeeklyOvertimeAlertService) {
    super();
  }

  async process(job: Job<WeeklyAlertJobData>): Promise<void> {
    const { employeeId, weekStartDate } = job.data;
    await this.weeklyOvertimeAlertService.evaluateAndNotify(employeeId, weekStartDate);
  }

  /** BullMQ Worker의 'error' 이벤트는 리스너가 없으면 Node가 uncaught
   * exception으로 취급해 프로세스 크래시로 이어질 수 있다 — 반드시 하나는
   * 등록해 둔다. */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`BullMQ worker error: ${err.message}`, err.stack);
  }
}
