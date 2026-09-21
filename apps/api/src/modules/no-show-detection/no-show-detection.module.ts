import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NoShowDetectionConsumer } from './no-show-detection.consumer';
import { NoShowDetectionService } from './no-show-detection.service';
import { NoShowDetectionTriggerService } from './no-show-detection-trigger.service';
import { NoShowScheduleService } from './no-show-schedule.service';
import { NO_SHOW_DETECTION_QUEUE_NAME } from './queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NO_SHOW_DETECTION_QUEUE_NAME,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 500 } },
    }),
  ],
  providers: [NoShowDetectionService, NoShowDetectionConsumer, NoShowDetectionTriggerService, NoShowScheduleService],
  exports: [NoShowDetectionTriggerService, NoShowDetectionService],
})
export class NoShowDetectionModule {}
