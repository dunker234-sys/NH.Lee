import { apiFetch, apiFetchMultipart } from '../apiClient';

export interface SiteCutover {
  id: string;
  siteId: string;
  cutoverDate: string;
  status: 'PENDING' | 'APPROVED';
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface MigrationRowError {
  sheet: string;
  rowNumber: number;
  employeeNo?: string;
  message: string;
}

export interface MigrationValidateResult {
  rowErrors: MigrationRowError[];
  commitToken: string | null;
}

export interface MigrationCommitResult {
  leaveBalanceRows: number;
  promotionLogRows: number;
  attendanceMonthlyRows: number;
  attendanceDailyRows: number;
  shiftTemplateRows: number;
  scheduleRows: number;
  reconciliation: { ready: boolean; totalRecords: number; unresolvedCount: number };
}

export interface ReconciliationMismatch {
  id: string;
  metric: string;
  manualValue: string;
  migratedValue: string;
  diff: string;
  employee: { employeeNo: string; name: string };
}

export interface CutoverReadiness {
  ready: boolean;
  totalRecords: number;
  unresolvedCount: number;
  mismatches: ReconciliationMismatch[];
}

export const migrationApi = {
  getCutover(siteId: string): Promise<SiteCutover | null> {
    return apiFetch(`/admin/migration/cutover?siteId=${siteId}`);
  },
  setCutoverDate(siteId: string, cutoverDate: string): Promise<SiteCutover> {
    return apiFetch('/admin/migration/cutover', { method: 'POST', body: { siteId, cutoverDate } });
  },
  excelValidate(siteId: string, file: File): Promise<MigrationValidateResult> {
    const form = new FormData();
    form.set('siteId', siteId);
    form.set('file', file);
    return apiFetchMultipart('/admin/migration/excel/validate', form);
  },
  excelCommit(commitToken: string): Promise<MigrationCommitResult> {
    return apiFetch('/admin/migration/excel/commit', { method: 'POST', body: { commitToken } });
  },
  readiness(siteId: string): Promise<CutoverReadiness> {
    return apiFetch(`/admin/migration/cutover/readiness?siteId=${siteId}`);
  },
  approve(siteId: string): Promise<SiteCutover> {
    return apiFetch('/admin/migration/cutover/approve', { method: 'POST', body: { siteId } });
  },
};
