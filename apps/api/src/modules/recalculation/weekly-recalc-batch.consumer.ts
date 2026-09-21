import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { SystemContextService } from '../../common/principal/system-context.service';
import { WeeklyAlertTriggerService } from '../weekly-alert/weekly-alert-trigger.service';
import { WeeklyOvertimeProjectionService } from '../weekly-alert/weekly-overtime-projection.service';
import { mondayOfWeek } from '../../common/time/week.util';
import { RecalculationService } from './recalculation.service';
import { WeeklyRecalcBatchService } from './weekly-recalc-batch.service';
import { TRIGGER_NIGHTLY_BATCH_JOB_NAME } from './weekly-recalc-batch-schedule.service';
import { WEEKLY_RECALC_BATCH_QUEUE_NAME, WeeklyRecalcBatchJobData } from './weekly-recalc-batch.queue.constants';

/** KST 기준 오늘 날짜("YYYY-MM-DD"). no-show-detection.consumer.ts의 yesterdayKst()와 같은 관례. */
function todayKst(): string {
  const kstMs = Date.now() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10);
}

/**
 * concurrency=10 — 이 큐는 야간(실시간 타각 트래픽이 없는 시간대)에만
 * 돈다는 전제라 RECALCULATION_QUEUE_NAME(concurrency 5, 주간 실시간
 * 트래픽과 공존)보다 높여도 안전하다. 3,736명 규모에서 5분 이내 완료가
 * 목표(요구사항서 4.4⑥) — 동시성을 이 값으로 잡아 실측했다.
 *
 * 잡 두 종류를 job.name으로 구분한다: 팬아웃 신호(trigger-nightly-batch)와
 * 실제 (직원×주) 작업(recalculate-week, 이름 미지정 시 기본값).
 */
@Processor(WEEKLY_RECALC_BATCH_QUEUE_NAME, { concurrency: 10 })
export class WeeklyRecalcBatchConsumer extends WorkerHost {
  private readonly logger = new Logger(WeeklyRecalcBatchConsumer.name);

  constructor(
    private readonly recalculationService: RecalculationService,
    private readonly systemContext: SystemContextService,
    private readonly weeklyAlertTrigger: WeeklyAlertTriggerService,
    private readonly weeklyRecalcBatchService: WeeklyRecalcBatchService,
    private readonly weeklyOvertimeProjectionService: WeeklyOvertimeProjectionService,
  ) {
    super();
  }

  async process(job: Job<WeeklyRecalcBatchJobData>): Promise<void> {
    if (job.name === TRIGGER_NIGHTLY_BATCH_JOB_NAME) {
      await this.weeklyRecalcBatchService.enqueueForAllActiveEmployees(mondayOfWeek(todayKst()));
      return;
    }

    const { employeeId, weekStartDate } = job.data;
    if (!employeeId || !weekStartDate) return;

    await this.systemContext.runAsSystem('attendance_weekly', () =>
      this.recalculationService.recalculateWeek(employeeId, weekStartDate),
    );

    try {
      await this.weeklyAlertTrigger.onWeeklyRecalculated(employeeId, weekStartDate);
    } catch (err) {
      this.logger.error(`[${employeeId} ${weekStartDate}] 52시간 알림 트리거 적재 실패: ${(err as Error).message}`);
    }

    // 예측 알림(요구사항서 4.4③)은 야간 배치에서만 평가한다 — 실시간 경로
    // (RecalculationConsumer)는 그날 실적만 반영되고 남은 계획근태 조회를
    // 매 타각마다 추가로 하지 않기 위해서다. 야간 배치는 이미 전 직원을
    // 순회하므로 여기서 함께 평가해도 별도 순회 비용이 들지 않는다.
    try {
      await this.weeklyOvertimeProjectionService.evaluateAndNotify(employeeId, weekStartDate, todayKst());
    } catch (err) {
      this.logger.error(`[${employeeId} ${weekStartDate}] 초과 예측 평가 실패: ${(err as Error).message}`);
    }
  }

  /** BullMQ Worker의 'error' 이벤트는 리스너가 없으면 Node가 uncaught
   * exception으로 취급해 프로세스 크래시로 이어질 수 있다 — 반드시 하나는
   * 등록해 둔다. */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`BullMQ worker error: ${err.message}`, err.stack);
  }
}
