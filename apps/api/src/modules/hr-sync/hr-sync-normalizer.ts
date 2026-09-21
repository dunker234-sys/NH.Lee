import { EmploymentType } from '@prisma/client';
import { StandardHrRecord } from './hr-sync.types';

export interface NormalizedHrRecord {
  employeeNo: string;
  name: string;
  siteId: string;
  department?: string;
  jobTitle?: string;
  hireDate: string;
  resignationDate?: string;
  employmentType: EmploymentType;
  contractedWorkMinutes?: number;
  managerEmployeeNo?: string;
  effectiveDate: string;
}

export interface HrSyncRowError {
  employeeNo: string;
  message: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 어댑터별 원본 고용형태 표기를 EmploymentType enum으로 매핑한다. enum
 * 값 자체(대소문자 무시)와 흔히 쓰이는 한국어 표기를 모두 인식한다 —
 * 알 수 없는 값은 null을 반환해 행 단위 ERROR로 분류되게 한다(전체 배치를
 * 막지 않는다, 요구사항서 5장 부분 처리 원칙).
 */
const EMPLOYMENT_TYPE_ALIASES: Record<string, EmploymentType> = {
  REGULAR: EmploymentType.REGULAR,
  정규: EmploymentType.REGULAR,
  정규직: EmploymentType.REGULAR,
  CONTRACT: EmploymentType.CONTRACT,
  계약: EmploymentType.CONTRACT,
  계약직: EmploymentType.CONTRACT,
  PART_TIME: EmploymentType.PART_TIME,
  단시간: EmploymentType.PART_TIME,
  ULTRA_PART_TIME: EmploymentType.ULTRA_PART_TIME,
  초단시간: EmploymentType.ULTRA_PART_TIME,
  DAILY: EmploymentType.DAILY,
  일용: EmploymentType.DAILY,
  일용직: EmploymentType.DAILY,
  DISPATCHED: EmploymentType.DISPATCHED,
  파견: EmploymentType.DISPATCHED,
  파견직: EmploymentType.DISPATCHED,
};

export function normalizeEmploymentType(raw: string): EmploymentType | null {
  return EMPLOYMENT_TYPE_ALIASES[raw.trim().toUpperCase()] ?? EMPLOYMENT_TYPE_ALIASES[raw.trim()] ?? null;
}

/**
 * 어댑터가 돌려준 원본 레코드를 검증·정규화한다. 행 단위 오류(사업장코드
 * 미존재, 사번 형식 오류, 날짜 형식 오류, 고용형태 매핑 실패 등)는 나머지
 * 행 처리를 막지 않고 ERROR로 분류만 한다.
 */
export function normalizeHrRecords(
  records: StandardHrRecord[],
  siteCodeToId: Map<string, string>,
): { normalized: NormalizedHrRecord[]; rowErrors: HrSyncRowError[] } {
  const normalized: NormalizedHrRecord[] = [];
  const rowErrors: HrSyncRowError[] = [];

  for (const record of records) {
    const employeeNo = record.employeeNo?.trim();
    if (!employeeNo) {
      rowErrors.push({ employeeNo: record.employeeNo ?? '(빈 사번)', message: '사번이 비어 있습니다.' });
      continue;
    }
    if (!record.name?.trim()) {
      rowErrors.push({ employeeNo, message: '성명이 비어 있습니다.' });
      continue;
    }
    const siteId = siteCodeToId.get(record.siteCode?.trim());
    if (!siteId) {
      rowErrors.push({ employeeNo, message: `사업장코드 '${record.siteCode}'를 찾을 수 없습니다.` });
      continue;
    }
    if (!DATE_RE.test(record.hireDate)) {
      rowErrors.push({ employeeNo, message: `입사일 형식이 올바르지 않습니다: ${record.hireDate}` });
      continue;
    }
    if (record.resignationDate && !DATE_RE.test(record.resignationDate)) {
      rowErrors.push({ employeeNo, message: `퇴사일 형식이 올바르지 않습니다: ${record.resignationDate}` });
      continue;
    }
    if (!DATE_RE.test(record.effectiveDate)) {
      rowErrors.push({ employeeNo, message: `유효기간 형식이 올바르지 않습니다: ${record.effectiveDate}` });
      continue;
    }
    const employmentType = normalizeEmploymentType(record.employmentType);
    if (!employmentType) {
      rowErrors.push({ employeeNo, message: `고용형태 '${record.employmentType}'를 알 수 없습니다.` });
      continue;
    }

    normalized.push({
      employeeNo,
      name: record.name.trim(),
      siteId,
      department: record.department?.trim() || undefined,
      jobTitle: record.jobTitle?.trim() || undefined,
      hireDate: record.hireDate,
      resignationDate: record.resignationDate,
      employmentType,
      contractedWorkMinutes: record.contractedWorkMinutes,
      managerEmployeeNo: record.managerEmployeeNo?.trim() || undefined,
      effectiveDate: record.effectiveDate,
    });
  }

  return { normalized, rowErrors };
}
