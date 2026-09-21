import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationPolicyModule } from '../../common/policy/notification-policy.module';
import { AlertLogController } from './alert-log.controller';
import { AlertLogRepository } from './alert-log.repository';
import { DummyEmailSender } from './channels/email.sender';
import { InAppSender } from './channels/in-app.sender';
import { NOTIFICATION_CHANNEL_SENDERS } from './channels/notification-channel-sender.interface';
import { DummyPushSender } from './channels/push.sender';
import { DeviceTokenController } from './device-token.controller';
import { DeviceTokenRepository } from './device-token.repository';
import { DeviceTokenService } from './device-token.service';
import { NotificationConsentService } from './notification-consent.service';
import { NotificationOpsService } from './notification-ops.service';
import { NotificationService } from './notification.service';
import { NotificationsConsumer } from './notifications.consumer';
import { NOTIFICATIONS_QUEUE_NAME } from './queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE_NAME,
      // 내부 잡 관례(attempts:3)보다 1회 더 준다 — 사용자 대상 알림은
      // 내부 재계산/부정사용탐지처럼 다음 트리거가 무료로 재시도해 주는
      // 자기치유가 없다(계획서 §3).
      defaultJobOptions: { attempts: 4, backoff: { type: 'exponential', delay: 500 } },
    }),
    NotificationPolicyModule,
  ],
  controllers: [DeviceTokenController, AlertLogController],
  providers: [
    DeviceTokenRepository,
    DeviceTokenService,
    AlertLogRepository,
    NotificationConsentService,
    NotificationService,
    NotificationOpsService,
    NotificationsConsumer,
    DummyPushSender,
    DummyEmailSender,
    InAppSender,
    {
      provide: NOTIFICATION_CHANNEL_SENDERS,
      useFactory: (push: DummyPushSender, email: DummyEmailSender, inApp: InAppSender) => [push, email, inApp],
      inject: [DummyPushSender, DummyEmailSender, InAppSender],
    },
  ],
  exports: [NotificationService, NotificationOpsService, DeviceTokenService, DummyPushSender, DummyEmailSender, InAppSender],
})
export class NotificationsModule {}
