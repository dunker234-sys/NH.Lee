import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RECALCULATION_QUEUE_NAME } from '../recalculation/queue.constants';
import { WEEKLY_RECALC_BATCH_QUEUE_NAME } from '../recalculation/weekly-recalc-batch.queue.constants';
import { MONTHLY_RECALC_BATCH_QUEUE_NAME } from '../recalculation/monthly-recalc-batch.queue.constants';
import { FRAUD_DETECTION_QUEUE_NAME } from '../fraud-detection/queue.constants';
import { WEEKLY_ALERT_QUEUE_NAME } from '../weekly-alert/queue.constants';
import { NOTIFICATIONS_QUEUE_NAME } from '../notifications/queue.constants';
import { NO_SHOW_DETECTION_QUEUE_NAME } from '../no-show-detection/queue.constants';
import { HR_SYNC_QUEUE_NAME } from '../hr-sync/queue.constants';
import { AUDIT_MERKLE_SEAL_QUEUE_NAME } from '../audit-integrity/queue.constants';
import { PUNCH_LOCATION_RETENTION_QUEUE_NAME } from '../retention/queue.constants';
import { OpsMonitoringController } from './ops-monitoring.controller';
import { OpsMonitoringService } from './ops-monitoring.service';

/**
 * STEP12: 관측 전용 모듈이라 각 큐를 소유 모듈이 아니라 여기서도
 * registerQueue()한다 — @nestjs/bullmq는 같은 큐 이름을 여러 모듈에서
 * 등록해도(Redis 상의 같은 큐를 가리키는 별도 Nest provider일 뿐) 안전하게
 * 공유되는 표준 패턴이다. 이 모듈은 그 어떤 큐에도 Processor/Worker를
 * 만들지 않는다 — 오직 getJobCounts() 등 읽기 전용 관측만 한다.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: RECALCULATION_QUEUE_NAME },
      { name: WEEKLY_RECALC_BATCH_QUEUE_NAME },
      { name: MONTHLY_RECALC_BATCH_QUEUE_NAME },
      { name: FRAUD_DETECTION_QUEUE_NAME },
      { name: WEEKLY_ALERT_QUEUE_NAME },
      { name: NOTIFICATIONS_QUEUE_NAME },
      { name: NO_SHOW_DETECTION_QUEUE_NAME },
      { name: HR_SYNC_QUEUE_NAME },
      { name: AUDIT_MERKLE_SEAL_QUEUE_NAME },
      { name: PUNCH_LOCATION_RETENTION_QUEUE_NAME },
    ),
  ],
  controllers: [OpsMonitoringController],
  providers: [OpsMonitoringService],
})
export class OpsMonitoringModule {}
