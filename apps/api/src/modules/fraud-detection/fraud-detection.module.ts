import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PunchPolicyModule } from '../../common/policy/punch-policy.module';
import { FraudDetectionConsumer } from './fraud-detection.consumer';
import { FraudDetectionService } from './fraud-detection.service';
import { FraudDetectionTriggerService } from './fraud-detection-trigger.service';
import { PunchFraudSignalRepository } from './punch-fraud-signal.repository';
import { FRAUD_DETECTION_QUEUE_NAME } from './queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: FRAUD_DETECTION_QUEUE_NAME,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 500 } },
    }),
    PunchPolicyModule,
  ],
  providers: [FraudDetectionService, FraudDetectionConsumer, FraudDetectionTriggerService, PunchFraudSignalRepository],
  exports: [FraudDetectionTriggerService],
})
export class FraudDetectionModule {}
