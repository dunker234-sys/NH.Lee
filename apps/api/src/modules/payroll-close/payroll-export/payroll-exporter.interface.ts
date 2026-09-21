export interface PayrollExportColumn {
  sourceField: string;
  header: string;
  order: number;
  unit: 'MINUTES' | 'HOURS' | 'DAYS' | 'KRW';
}

export interface PayrollExportRow {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  workDate?: string;
  values: Record<string, number>;
}

export interface PayrollExportRequest {
  siteId: string;
  periodYearMonth: string;
  layoutType: 'MONTHLY' | 'DAILY';
  columns: PayrollExportColumn[];
  rows: PayrollExportRow[];
}

export interface PayrollExportResult {
  format: 'EXCEL' | 'CSV';
  filename: string;
  buffer: Buffer;
  checksum: string;
  rowCount: number;
}

/**
 * 내보내기 포맷 확장 지점. 새 포맷(예: 향후 API/DB 직송 방식)은 이 인터페이스를
 * 구현하는 새 Provider를 추가하는 것으로 끝난다 — 호출부(PayrollExportService)를
 * 건드리지 않는다(요구사항서 4.8④ "API/DB 방식 확장 대비").
 */
export interface PayrollExporter {
  readonly format: 'EXCEL' | 'CSV';
  export(request: PayrollExportRequest): Promise<PayrollExportResult>;
}

export const PAYROLL_EXPORTERS = 'PAYROLL_EXPORTERS';

/** 분 값을 단위(unit)에 맞춰 표시용 숫자로 환산한다. KRW/일수는 그대로 둔다. */
export function convertValueForUnit(minutesOrRawValue: number, unit: PayrollExportColumn['unit']): number {
  if (unit === 'HOURS') return Math.round((minutesOrRawValue / 60) * 100) / 100;
  return minutesOrRawValue;
}
