import { EmploymentType } from '@prisma/client';
import { NormalizedHrRecord } from './hr-sync-normalizer';

export interface ExistingEmployeeSnapshot {
  id: string;
  employeeNo: string;
  name: string;
  siteId: string;
  department: string | null;
  jobTitle: string | null;
  employmentType: EmploymentType;
  hireDate: string; // YYYY-MM-DD
  resignationDate: string | null;
  contractedWorkMinutes: number | null;
  managerEmployeeNo: string | null;
  hrSourceEffectiveDate: string | null;
  status: 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED';
}

export type HrSyncDiffEntry =
  | { changeType: 'NEW'; employeeNo: string; after: NormalizedHrRecord }
  | { changeType: 'CHANGED'; employeeNo: string; before: ExistingEmployeeSnapshot; after: NormalizedHrRecord }
  | { changeType: 'DEPARTED'; employeeNo: string; before: ExistingEmployeeSnapshot; resignationDate: string | null };

const COMPARABLE_FIELDS: (keyof NormalizedHrRecord & keyof ExistingEmployeeSnapshot)[] = [
  'name',
  'siteId',
  'department',
  'jobTitle',
  'employmentType',
  'contractedWorkMinutes',
];

function hasFieldChange(before: ExistingEmployeeSnapshot, after: NormalizedHrRecord): boolean {
  if (COMPARABLE_FIELDS.some((f) => (before[f] ?? null) !== (after[f] ?? null))) return true;
  if ((before.managerEmployeeNo ?? null) !== (after.managerEmployeeNo ?? null)) return true;
  return false;
}

/**
 * 피드가 최신 수동정정을 덮지 않도록: 기존 레코드가 이번 피드보다 더 최근
 * effectiveDate로 이미 갱신되어 있으면 이번 행은 건너뛴다(오래된 피드).
 */
function isStale(before: ExistingEmployeeSnapshot | undefined, after: NormalizedHrRecord): boolean {
  if (!before?.hrSourceEffectiveDate) return false;
  return after.effectiveDate < before.hrSourceEffectiveDate;
}

export interface HrSyncDiffResult {
  entries: HrSyncDiffEntry[];
  staleSkippedEmployeeNos: string[];
}

/**
 * 정규화된 피드 전체와 현재 재직(ACTIVE/ON_LEAVE) Employee 스냅샷을 비교한다.
 * SECONDARY 배정이나 겸직 관계는 건드리지 않는다 — PRIMARY 소속 변경만
 * 이 diff의 관심사다(요구사항서 5장⑤, EmployeeSiteAssignment는 그대로 둔다).
 */
export function diffHrRecords(
  normalized: NormalizedHrRecord[],
  existingByEmployeeNo: Map<string, ExistingEmployeeSnapshot>,
): HrSyncDiffResult {
  const entries: HrSyncDiffEntry[] = [];
  const staleSkippedEmployeeNos: string[] = [];
  const seenEmployeeNos = new Set<string>();

  for (const after of normalized) {
    seenEmployeeNos.add(after.employeeNo);
    const before = existingByEmployeeNo.get(after.employeeNo);

    if (!before) {
      entries.push({ changeType: 'NEW', employeeNo: after.employeeNo, after });
      continue;
    }

    if (isStale(before, after)) {
      staleSkippedEmployeeNos.push(after.employeeNo);
      continue;
    }

    if (after.resignationDate && !before.resignationDate) {
      entries.push({ changeType: 'DEPARTED', employeeNo: after.employeeNo, before, resignationDate: after.resignationDate });
      continue;
    }

    if (hasFieldChange(before, after)) {
      entries.push({ changeType: 'CHANGED', employeeNo: after.employeeNo, before, after });
    }
  }

  for (const [employeeNo, before] of existingByEmployeeNo) {
    if (seenEmployeeNos.has(employeeNo)) continue;
    if (before.status !== 'ACTIVE') continue;
    entries.push({ changeType: 'DEPARTED', employeeNo, before, resignationDate: null });
  }

  return { entries, staleSkippedEmployeeNos };
}
