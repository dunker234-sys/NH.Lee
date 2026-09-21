import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PunchLocationRetentionConsumer } from './punch-location-retention.consumer';
import { PunchLocationRetentionScheduleService } from './punch-location-retention-schedule.service';
import { PunchLocationRetentionService } from './punch-location-retention.service';
import { PunchLocationRetentionTriggerService } from './punch-location-retention-trigger.service';
import { PUNCH_LOCATION_RETENTION_QUEUE_NAME } from './queue.constants';
import { RetentionPrismaService } from './retention-prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PUNCH_LOCATION_RETENTION_QUEUE_NAME,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 500 } },
    }),
  ],
  providers: [
    RetentionPrismaService,
    PunchLocationRetentionService,
    PunchLocationRetentionScheduleService,
    PunchLocationRetentionConsumer,
    PunchLocationRetentionTriggerService,
  ],
  // ConsentModule이 §24④(철회 시 지체없는 파기) 트리거를 걸 수 있도록 export한다.
  exports: [PunchLocationRetentionTriggerService, PunchLocationRetentionService],
})
export class RetentionModule {}
