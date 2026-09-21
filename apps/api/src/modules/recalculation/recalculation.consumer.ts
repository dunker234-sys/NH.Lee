import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { SystemContextService } from '../../common/principal/system-context.service';
import { WeeklyAlertTriggerService } from '../weekly-alert/weekly-alert-trigger.service';
import { mondayOfWeek } from '../../common/time/week.util';
import { RecalculationService } from './recalculation.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from './queue.constants';

/**
 * 큐 잡 1개 = (직원, 근로일) 1개. SYSTEM 주체로 실행하며, BullMQ 기본 재시도가
 * 소진된 뒤 남는 네이티브 failed 목록이 곧 DLQ다(별도 DLQ 큐를 두지 않는다).
 * concurrency=5: AuditLogService.write()가 advisory lock으로 전역 직렬화되므로
 * 과도한 동시성은 그 락 경합만 늘린다(대량 백필 시 병목 — 문서화된 갭).
 */
@Processor(RECALCULATION_QUEUE_NAME, { concurrency: 5 })
export class RecalculationConsumer extends WorkerHost {
  private readonly logger = new Logger(RecalculationConsumer.name);

  constructor(
    private readonly recalculationService: RecalculationService,
    private readonly systemContext: SystemContextService,
    private readonly weeklyAlertTrigger: WeeklyAlertTriggerService,
  ) {
    super();
  }

  async process(job: Job<RecalculationJobData>): Promise<void> {
    const { employeeId, workDate } = job.data;
    // job.id는 "employeeId_workDate" 중복제거 키라 audit_log.job_id(UUID 컬럼)에 넣을 수 없다
    // — runAsSystem이 자체적으로 새 UUID를 생성하게 둔다.
    await this.systemContext.runAsSystem('attendance_daily', (principal) =>
      this.recalculationService.recalculateSingleDay(employeeId, workDate, principal),
    );

    // STEP9: 타각 시 실시간 재계산 직후 52시간 알림 평가를 큐에 올린다
    // (요구사항서 4.4②). Redis에 잡 하나 적재하는 것뿐이라 빠르다 — 실제
    // 평가(Postgres 조회 포함)는 별도 큐(weekly-alert.consumer.ts)가
    // 낮은 동시성으로 처리해, 이 큐(재계산)의 커넥션 풀 사용과 겹치지
    // 않게 한다. enqueue 자체가 실패해도 재계산 자체를 실패시키지 않는다.
    try {
      await this.weeklyAlertTrigger.onWeeklyRecalculated(employeeId, mondayOfWeek(workDate));
    } catch (err) {
      this.logger.error(`[${employeeId} ${workDate}] 52시간 알림 트리거 적재 실패: ${(err as Error).message}`);
    }
  }

  /** BullMQ Worker의 'error' 이벤트(예: punches-p95 e2e처럼 강제
   * obliterate된 잡의 잠금 갱신 실패)는 리스너가 없으면 Node가 uncaught
   * exception으로 취급해 프로세스 크래시로 이어질 수 있다 — 반드시 하나는
   * 등록해 둔다. */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`BullMQ worker error: ${err.message}`, err.stack);
  }
}
