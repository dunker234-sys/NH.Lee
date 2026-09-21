import { AlertLog, AlertLogChannel, DeviceToken } from '@prisma/client';

export interface NotificationSendContext {
  alertLog: AlertLog;
  deviceTokens: DeviceToken[]; // 적재 시점이 아니라 발송 시점에 새로 조회한 값
  renderedTitle: string;
  renderedBody: string;
}

export interface NotificationChannelSender {
  readonly channel: AlertLogChannel;
  /** 실패 시 throw한다 — 컨슈머가 이를 잡아 재시도/DLQ로 넘긴다. */
  send(ctx: NotificationSendContext): Promise<void>;
}

export const NOTIFICATION_CHANNEL_SENDERS = Symbol('NOTIFICATION_CHANNEL_SENDERS');
