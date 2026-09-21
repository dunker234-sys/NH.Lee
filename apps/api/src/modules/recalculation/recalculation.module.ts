import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WeeklyAlertModule } from '../weekly-alert/weekly-alert.module';
import { AttendanceInputBuilderService } from './attendance-input-builder.service';
import { LaborAgreementResolverService } from './labor-agreement-resolver.service';
import { PolicyConfigResolverService } from './policy-config-resolver.service';
import { RecalculationConsumer } from './recalculation.consumer';
import { RecalculationOpsService } from './recalculation-ops.service';
import { RecalculationService } from './recalculation.service';
import { RecalculationTriggerService } from './recalculation-trigger.service';
import { RECALCULATION_QUEUE_NAME } from './queue.constants';
import { WeeklyRecalcBatchConsumer } from './weekly-recalc-batch.consumer';
import { WeeklyRecalcBatchScheduleService } from './weekly-recalc-batch-schedule.service';
import { WeeklyRecalcBatchService } from './weekly-recalc-batch.service';
import { WEEKLY_RECALC_BATCH_QUEUE_NAME } from './weekly-recalc-batch.queue.constants';

@Module({
  imports: [
    WeeklyAlertModule,
    BullModule.registerQueue({
      name: RECALCULATION_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 500 },
        // recalculationJobId()는 (employeeId, workDate)로 고정된 잡 ID를 쓴다 —
        // 완료된 잡을 큐에 남겨두면(BullMQ 기본값) 같은 ID로 다시 add()해도
        // 재처리 없이 조용히 기존 완료 잡을 반환한다. STEP6.5(승인 후 재계산)처럼
        // 이미 한 번 계산이 끝난 날짜를 다시 트리거해야 하는 경로가 있으므로,
        // 완료 즉시 제거해 같은 ID를 재사용할 수 있게 한다. 실패 잡은 그대로
        // 남겨 DLQ로 쓴다(RecalculationOpsService.retryFailedJobs() 참고).
        removeOnComplete: true,
      },
    }),
    // STEP9: 야간 정합성 배치 + 3,736명 규모 주간 재계산 성능 완료조건 전용 큐.
    // RECALCULATION_QUEUE_NAME과 물리적으로 분리한다(위 큐는 실시간 타각
    // 트래픽과 커넥션 풀을 공유하므로, 대량 야간 배치를 여기 섞으면 P95가
    // 흔들린다 — weekly-alert.module.ts와 같은 이유).
    BullModule.registerQueue({
      name: WEEKLY_RECALC_BATCH_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 500 },
        removeOnComplete: true,
      },
    }),
  ],
  providers: [
    AttendanceInputBuilderService,
    PolicyConfigResolverService,
    LaborAgreementResolverService,
    RecalculationService,
    RecalculationConsumer,
    RecalculationTriggerService,
    RecalculationOpsService,
    WeeklyRecalcBatchService,
    WeeklyRecalcBatchConsumer,
    WeeklyRecalcBatchScheduleService,
  ],
  exports: [RecalculationService, RecalculationTriggerService, RecalculationOpsService, WeeklyRecalcBatchService],
})
export class RecalculationModule {}
