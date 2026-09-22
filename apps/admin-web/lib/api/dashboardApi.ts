import { apiFetch } from '../apiClient';

export interface HqDashboardSummary {
  totalHeadcount: number;
  dayOffCount: number;
  todayScheduledCount: number;
  todayCheckedInCount: number;
  todayAttendanceRatePercent: number;
  todayNoShowCount: number;
  atRiskEmployeeCount: number;
  pendingApprovalCount: number;
  fraudReviewQueueCount: number;
  unapprovedUnjudgedCount: number;
}

export interface SiteDashboardSummary {
  siteId: string;
  todayWorkingCount: number;
  dayOffCount: number;
  todayNoShowCount: number;
  pendingApprovalCount: number;
  atRiskEmployeeCount: number;
}

export const dashboardApi = {
  getHq: () => apiFetch<HqDashboardSummary>('/admin/dashboard/hq'),
  getSite: (siteId: string) => apiFetch<SiteDashboardSummary>(`/admin/dashboard/site/${siteId}`),
};
