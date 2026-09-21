/**
 * 근태 시스템 본체(동기화 엔진)가 바라보는 유일한 인사정보 스키마.
 * 어댑터별 원본 컬럼명·포맷 차이는 각 어댑터 내부에서 이 스키마로 흡수한다
 * (요구사항서 5장 ①). employmentType은 어댑터별 원본 문자열 그대로 두고,
 * normalizer가 EmploymentType enum으로 매핑한다 — 매핑 실패는 행 단위
 * ERROR로 분류될 뿐 나머지 행 처리를 막지 않는다(부분 처리).
 */
export interface StandardHrRecord {
  employeeNo: string;
  name: string;
  siteCode: string;
  department?: string;
  jobTitle?: string;
  hireDate: string; // YYYY-MM-DD
  resignationDate?: string; // YYYY-MM-DD
  employmentType: string;
  contractedWorkMinutes?: number;
  managerEmployeeNo?: string;
  /** 이 레코드가 인사시스템 기준으로 유효한 시점(YYYY-MM-DD). */
  effectiveDate: string;
}

/**
 * 3종 어댑터(File/Db/Api)가 공통으로 구현하는 인터페이스. 동기화 엔진은
 * 이 인터페이스에만 의존하고, 실제 구현체 선택은 HR_SOURCE_ADAPTER 팩토리
 * 프로바이더(hr-sync.module.ts)가 설정값(hrSync.adapterType) 한 줄로 한다.
 */
export interface HrSourceAdapter {
  fetchAll(asOfDate: string): Promise<StandardHrRecord[]>;
}

export const HR_SOURCE_ADAPTER = Symbol('HR_SOURCE_ADAPTER');

export type HrSyncAdapterType = 'FILE' | 'DB' | 'API';
