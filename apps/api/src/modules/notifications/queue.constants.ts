import { AlertLogChannel } from '@prisma/client';

export const NOTIFICATIONS_QUEUE_NAME = 'notifications';

export interface NotificationJobData {
  alertLogId: string;
  channel: AlertLogChannel;
}
