import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannelSender, NotificationSendContext } from './notification-channel-sender.interface';

/** 더미 email 발송기 — 실제 SMTP 연동은 범위 밖(문서화된 갭). PushSender와 동일한 forceFail 계약. */
@Injectable()
export class DummyEmailSender implements NotificationChannelSender {
  readonly channel = 'EMAIL' as const;
  private readonly logger = new Logger(DummyEmailSender.name);
  callCount = 0;

  async send(ctx: NotificationSendContext): Promise<void> {
    this.callCount += 1;
    if (ctx.alertLog.payload && (ctx.alertLog.payload as Record<string, unknown>).forceFail === true) {
      throw new Error('DummyEmailSender: forceFail 플래그로 인한 결정적 실패');
    }
    this.logger.log(`[EMAIL] to=${ctx.alertLog.recipientEmployeeId} "${ctx.renderedTitle}" body="${ctx.renderedBody}"`);
  }
}
