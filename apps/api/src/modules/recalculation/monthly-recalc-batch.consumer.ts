import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SystemContextService } from '../../common/principal/system-context.service';
import { yearMonthOf } from '../../common/time/week.util';
import { RecalculationService } from './recalculation.service';
import { MonthlyRecalcBatchService } from './monthly-recalc-batch.service';
import { TRIGGER_MONTHLY_BATCH_JOB_NAME } from './monthly-recalc-batch-schedule.service';
import { MONTHLY_RECALC_BATCH_QUEUE_NAME, MonthlyRecalcBatchJobData } from './monthly-recalc-batch.queue.constants';

/** KST 기준 어제 날짜("YYYY-MM-DD"). no-show-detection.consumer.ts의 yesterdayKst()와 같은 관례.
 * 이 배치는 매월 1일에 도니까 "어제"가 곧 방금 마감된 달의 마지막 날이다. */
function yesterdayKst(): string {
  const kstMs = Date.now() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
}

/**
 * STEP12: concurrency=10 — weekly-recalc-batch.consumer.ts와 동일한 근거
 * (야간 전용 큐, 실시간 트래픽과 공존하지 않음). 이 배치는 매일 점진
 * 갱신되는 attendance_monthly를 월마감 직전 한 번 더 전 직원 대상으로
 * 완전성 재검증하는 것이 목적이라, weekly와 달리 알림 트리거는 걸지
 * 않는다(52시간 알림·예측 알림은 이미 일별/주간 경로가 담당).
 */
@Processor(MONTHLY_RECALC_BATCH_QUEUE_NAME, { concurrency: 10 })
export class MonthlyRecalcBatchConsumer extends WorkerHost {
  private readonly logger = new Logger(MonthlyRecalcBatchConsumer.name);

  constructor(
    private readonly recalculationService: RecalculationService,
    private readonly systemContext: SystemContextService,
    private readonly monthlyRecalcBatchService: MonthlyRecalcBatchService,
  ) {
    super();
  }

  async process(job: Job<MonthlyRecalcBatchJobData>): Promise<void> {
    if (job.name === TRIGGER_MONTHLY_BATCH_JOB_NAME) {
      await this.monthlyRecalcBatchService.enqueueForAllActiveEmployees(yearMonthOf(yesterdayKst()));
      return;
    }

    const { employeeId, yearMonth } = job.data;
    if (!employeeId || !yearMonth) return;

    await this.systemContext.runAsSystem('attendance_monthly', () => this.recalculationService.recalculateMonth(employeeId, yearMonth));
  }

  /** BullMQ Worker의 'error' 이벤트는 리스너가 없으면 Node가 uncaught
   * exception으로 취급해 프로세스 크래시로 이어질 수 있다 — 반드시 하나는
   * 등록해 둔다. */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`BullMQ worker error: ${err.message}`, err.stack);
  }
}
