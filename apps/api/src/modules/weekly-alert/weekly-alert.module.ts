import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WeeklyAlertPolicyModule } from '../../common/policy/weekly-alert-policy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WeeklyAlertRecipientResolverService } from './weekly-alert-recipient-resolver.service';
import { WeeklyAlertTriggerService } from './weekly-alert-trigger.service';
import { WeeklyAlertConsumer } from './weekly-alert.consumer';
import { WeeklyOvertimeAlertService } from './weekly-overtime-alert.service';
import { WeeklyOvertimeProjectionService } from './weekly-overtime-projection.service';
import { WEEKLY_ALERT_QUEUE_NAME } from './queue.constants';

/**
 * RecalculationModule이 이 모듈을 import해 RecalculationConsumer 후처리로
 * WeeklyAlertTriggerService를 호출한다(타각 시 실시간 재계산 트리거,
 * 요구사항서 4.4②). 실제 평가(WeeklyOvertimeAlertService)는 별도 큐
 * (weekly-alert.consumer.ts)에서 낮은 동시성으로 처리한다 — 재계산 큐와
 * 같은 잡 안에서 직접 호출하면 Postgres 커넥션 풀을 두고 경쟁해 타각
 * API의 P95(STEP4 완료조건)가 흔들리는 것을 실측으로 확인했다.
 * 반대 방향 의존(WeeklyAlert → Recalculation)은 두지 않는다 — 순환 모듈
 * 의존을 피하기 위해서다(weekly-alert-policy-resolver.service.ts 주석 참고).
 */
@Module({
  imports: [
    WeeklyAlertPolicyModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: WEEKLY_ALERT_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 500 },
        removeOnComplete: true,
      },
    }),
  ],
  providers: [
    WeeklyAlertRecipientResolverService,
    WeeklyOvertimeAlertService,
    WeeklyOvertimeProjectionService,
    WeeklyAlertTriggerService,
    WeeklyAlertConsumer,
  ],
  exports: [WeeklyOvertimeAlertService, WeeklyOvertimeProjectionService, WeeklyAlertRecipientResolverService, WeeklyAlertTriggerService],
})
export class WeeklyAlertModule {}
