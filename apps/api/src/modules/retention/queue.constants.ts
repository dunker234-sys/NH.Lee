export const PUNCH_LOCATION_RETENTION_QUEUE_NAME = 'punch-location-retention';

export type PunchLocationRetentionJobName = 'purge-due' | 'purge-employee-immediate';

export interface PunchLocationRetentionJobData {
  /** purge-employee-immediate 잡에서만 채운다(§24④ 철회 시 지체없는 파기). */
  employeeId?: string;
}
