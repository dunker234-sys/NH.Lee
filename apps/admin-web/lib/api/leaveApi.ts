import { apiFetch, buildQuery } from '../apiClient';

export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'CANCEL_PENDING';
export type LeaveUnit = 'FULL' | 'HALF' | 'QUARTER';
export type LeaveCategory =
  | 'ANNUAL'
  | 'HALF_DAY'
  | 'QUARTER_DAY'
  | 'CONGRATULATION'
  | 'PUBLIC'
  | 'SICK'
  | 'UNPAID'
  | 'SUBSTITUTE'
  | 'COMPENSATORY';
export type LeaveDeductionUnit = 'FULL_DAY' | 'HALF_DAY' | 'HOUR';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  unit: LeaveUnit;
  reason: string | null;
  status: LeaveRequestStatus;
  deductedDays: string;
  version: number;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  category: LeaveCategory;
  paid: boolean;
  deductionUnit: LeaveDeductionUnit;
  evidenceRequired: boolean;
  applicationDeadlineDaysBeforeUse: number | null;
}

export const leaveRequestApi = {
  list: (params: { siteId?: string; status?: LeaveRequestStatus }) =>
    apiFetch<LeaveRequest[]>(`/admin/leave/requests${buildQuery(params)}`),
  approve: (id: string, expectedVersion: number) =>
    apiFetch<LeaveRequest>(`/admin/leave/requests/${id}/approve`, { method: 'POST', body: { expectedVersion } }),
  reject: (id: string, expectedVersion: number, reason: string) =>
    apiFetch<LeaveRequest>(`/admin/leave/requests/${id}/reject`, { method: 'POST', body: { expectedVersion, reason } }),
  approveCancellation: (id: string) => apiFetch<LeaveRequest>(`/admin/leave/requests/${id}/approve-cancellation`, { method: 'POST' }),
  rejectCancellation: (id: string) => apiFetch<LeaveRequest>(`/admin/leave/requests/${id}/reject-cancellation`, { method: 'POST' }),
};

export interface CreateLeaveTypeInput {
  code: string;
  name: string;
  category: LeaveCategory;
  paid: boolean;
  deductionUnit: LeaveDeductionUnit;
  evidenceRequired?: boolean;
  applicationDeadlineDaysBeforeUse?: number;
}

export const leaveTypeApi = {
  list: () => apiFetch<LeaveType[]>('/admin/leave/types'),
  create: (input: CreateLeaveTypeInput) => apiFetch<LeaveType>('/admin/leave/types', { method: 'POST', body: input }),
  update: (id: string, input: Partial<Pick<LeaveType, 'name' | 'evidenceRequired' | 'applicationDeadlineDaysBeforeUse'>>) =>
    apiFetch<LeaveType>(`/admin/leave/types/${id}`, { method: 'PATCH', body: input }),
};

export const compensatoryLeaveApi = {
  convert: (input: { employeeId: string; sourceOvertimeRequestId: string; sourceCategory: 'OVERTIME' | 'NIGHT' | 'HOLIDAY_WITHIN_8H' | 'HOLIDAY_EXCESS_8H' }) =>
    apiFetch('/admin/leave/compensatory/convert', { method: 'POST', body: input }),
};

export const leaveAccrualApi = {
  run: (asOfDate: string, siteId?: string) => apiFetch('/admin/leave/accrual/run', { method: 'POST', body: { asOfDate, siteId } }),
};

export const leavePromotionApi = {
  run: (asOfDate: string, siteId?: string) => apiFetch('/admin/leave/promotion/run', { method: 'POST', body: { asOfDate, siteId } }),
  compliance: (leaveBalanceId: string) => apiFetch(`/admin/leave/promotion/compliance${buildQuery({ leaveBalanceId })}`),
  updatePolicy: (input: { siteId?: string; effectiveStartDate: string; values: Record<string, number> }) =>
    apiFetch('/admin/leave/promotion-policy', { method: 'PUT', body: input }),
};
