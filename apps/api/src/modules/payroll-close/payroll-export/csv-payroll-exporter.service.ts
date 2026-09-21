import { Injectable } from '@nestjs/common';
import { sha256 } from '../../../common/crypto/hash.util';
import { convertValueForUnit, PayrollExportRequest, PayrollExportResult, PayrollExporter } from './payroll-exporter.interface';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** RFC4180 CSV. 신규 의존성 없이 직접 작성한다(단순 평면 내보내기라 라이브러리 불필요). */
@Injectable()
export class CsvPayrollExporter implements PayrollExporter {
  readonly format = 'CSV' as const;

  async export(request: PayrollExportRequest): Promise<PayrollExportResult> {
    const sortedColumns = [...request.columns].sort((a, b) => a.order - b.order);
    const headerCells = ['사번', '이름', ...(request.layoutType === 'DAILY' ? ['근무일'] : []), ...sortedColumns.map((c) => c.header)];
    const lines = [headerCells.map(csvEscape).join(',')];

    for (const row of request.rows) {
      const cells = [
        row.employeeNo,
        row.employeeName,
        ...(request.layoutType === 'DAILY' ? [row.workDate ?? ''] : []),
        ...sortedColumns.map((c) => String(convertValueForUnit(row.values[c.sourceField] ?? 0, c.unit))),
      ];
      lines.push(cells.map(csvEscape).join(','));
    }

    // BOM 포함 UTF-8 — 엑셀에서 열어도 한글이 깨지지 않도록.
    const buffer = Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(lines.join('\r\n'), 'utf8')]);
    return {
      format: 'CSV',
      filename: `payroll_${request.siteId}_${request.periodYearMonth}.csv`,
      buffer,
      checksum: sha256(buffer.toString('binary')),
      rowCount: request.rows.length,
    };
  }
}
