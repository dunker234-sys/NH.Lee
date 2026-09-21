import { Injectable } from '@nestjs/common';
import { NotificationChannelSender, NotificationSendContext } from './notification-channel-sender.interface';

/**
 * 인앱 배너는 외부 호출이 없다 — "배너"는 alert_log 행(channel='IN_APP')
 * 자체다. 별도 인박스 테이블을 새로 만들지 않는다(문서화된 갭: 조회
 * 엔드포인트는 STEP5 모바일 앱이 alert_log를 직접 조회하는 형태로 만든다).
 */
@Injectable()
export class InAppSender implements NotificationChannelSender {
  readonly channel = 'IN_APP' as const;
  callCount = 0;

  async send(ctx: NotificationSendContext): Promise<void> {
    this.callCount += 1;
    if (ctx.alertLog.payload && (ctx.alertLog.payload as Record<string, unknown>).forceFail === true) {
      throw new Error('InAppSender: forceFail 플래그로 인한 결정적 실패');
    }
  }
}
