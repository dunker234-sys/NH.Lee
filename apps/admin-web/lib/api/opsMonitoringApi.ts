import { apiFetch } from '../apiClient';

export interface QueueHealth {
  queueName: string;
  completed: number;
  failed: number;
  successRatePercent: number | null;
  failedBacklog: number;
}

export interface OpsMonitoringSummary {
  punchFailureRatePercent: number | null;
  todayNoShowCount: number;
  unapprovedUnjudgedCount: number;
  notificationSuccessRatePercent: number | null;
  batchSuccessRatePercent: number | null;
  totalFailedBacklog: number;
  queues: QueueHealth[];
}

/** STEP12 §B5. 백엔드는 HQ_HR/ADMIN 역할만 허용한다(OpsMonitoringController @Roles). */
export const opsMonitoringApi = {
  getSummary: (): Promise<OpsMonitoringSummary> => apiFetch('/admin/ops/monitoring'),
};
