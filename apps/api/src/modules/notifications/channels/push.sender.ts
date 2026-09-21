import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannelSender, NotificationSendContext } from './notification-channel-sender.interface';

/**
 * 더미 push 발송기 — 실제 FCM/APNs 연동은 이번 STEP 범위 밖(문서화된 갭,
 * STEP4의 "QR TOTP 관리 UI는 STEP5-B/6 몫" 패턴과 동일). 기본은 로그만
 * 남기고 성공, payload.forceFail===true일 때만 결정적으로 실패한다 —
 * 이미 더미 발송기이므로 이 플래그는 발송기 계약의 일부이지 숨겨진
 * 테스트 백도어가 아니다.
 */
@Injectable()
export class DummyPushSender implements NotificationChannelSender {
  readonly channel = 'PUSH' as const;
  private readonly logger = new Logger(DummyPushSender.name);
  callCount = 0;

  async send(ctx: NotificationSendContext): Promise<void> {
    this.callCount += 1;
    if (ctx.alertLog.payload && (ctx.alertLog.payload as Record<string, unknown>).forceFail === true) {
      throw new Error('DummyPushSender: forceFail 플래그로 인한 결정적 실패');
    }
    this.logger.log(`[PUSH] to=${ctx.alertLog.recipientEmployeeId} tokens=${ctx.deviceTokens.length} "${ctx.renderedTitle}"`);
  }
}
