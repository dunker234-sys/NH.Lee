import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { sha256 } from '../../../common/crypto/hash.util';
import { convertValueForUnit, PayrollExportRequest, PayrollExportResult, PayrollExporter } from './payroll-exporter.interface';

/** partner-employee-excel.service.ts와 동일하게 이미 쓰던 exceljs를 재사용한다. */
@Injectable()
export class ExcelPayrollExporter implements PayrollExporter {
  readonly format = 'EXCEL' as const;

  async export(request: PayrollExportRequest): Promise<PayrollExportResult> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('급여산출');
    const sortedColumns = [...request.columns].sort((a, b) => a.order - b.order);

    const headerRow = ['사번', '이름', ...(request.layoutType === 'DAILY' ? ['근무일'] : []), ...sortedColumns.map((c) => c.header)];
    sheet.addRow(headerRow);

    for (const row of request.rows) {
      sheet.addRow([
        row.employeeNo,
        row.employeeName,
        ...(request.layoutType === 'DAILY' ? [row.workDate ?? ''] : []),
        ...sortedColumns.map((c) => convertValueForUnit(row.values[c.sourceField] ?? 0, c.unit)),
      ]);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      format: 'EXCEL',
      filename: `payroll_${request.siteId}_${request.periodYearMonth}.xlsx`,
      buffer,
      checksum: sha256(buffer.toString('binary')),
      rowCount: request.rows.length,
    };
  }
}
