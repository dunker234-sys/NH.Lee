export const WEEKLY_ALERT_QUEUE_NAME = 'weekly-alert';

export interface WeeklyAlertJobData {
  employeeId: string;
  weekStartDate: string;
}
