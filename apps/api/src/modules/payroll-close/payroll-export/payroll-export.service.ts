import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PayrollColumnMappingService } from './payroll-column-mapping.service';
import { PAYROLL_EXPORTERS, PayrollExporter, PayrollExportRow } from './payroll-exporter.interface';

const NUMERIC_FIELDS = [
  'scheduledWorkMinutes',
  'approvedOvertimeMinutes',
  'unapprovedOvertimeMinutes',
  'nightWorkMinutes',
  'holidayWorkMinutesNormal',
  'holidayWorkMinutesExcess',
  'absenceDays',
  'latenessDays',
  'earlyLeaveDays',
  'paidLeaveDays',
  'unpaidLeaveDays',
  'weeklyPaidRestEligibleCount',
  'weeklyPaidRestMinutes',
  'ordinaryHourlyWageAmount',
  'basePayAmount',
  'overtimePayAmount',
  'nightPayAmount',
  'holidayPayAmount',
  'weeklyPaidRestPayAmount',
  'totalPayAmount',
] as const;

@Injectable()
export class PayrollExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly columnMappingService: PayrollColumnMappingService,
    @Inject(PAYROLL_EXPORTERS) private readonly exporters: PayrollExporter[],
  ) {}

  async exportClose(
    siteId: string,
    periodYearMonth: string,
    format: 'EXCEL' | 'CSV',
    exportedBy: string,
    columnMappingId?: string,
  ) {
    const close = await this.prisma.payrollClose.findUnique({ where: { siteId_periodYearMonth: { siteId, periodYearMonth } } });
    if (!close) throw new NotFoundException({ code: 'PAYROLL_CLOSE_NOT_FOUND', message: `마감(${siteId}, ${periodYearMonth})을 찾을 수 없습니다.` });

    const items = await this.prisma.payrollStatementItem.findMany({
      where: { payrollCloseId: close.id },
      include: { employee: { select: { employeeNo: true, name: true } } },
      orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
    });
    if (items.length === 0) throw new NotFoundException({ code: 'PAYROLL_STATEMENT_EMPTY', message: '산출된 급여 항목이 없습니다. 먼저 급여를 산출해 주세요.' });

    const layoutType = items[0].layoutType;
    const columns = await this.columnMappingService.resolveColumns(siteId, layoutType, columnMappingId);

    const rows: PayrollExportRow[] = items.map((item) => {
      const values: Record<string, number> = {};
      for (const field of NUMERIC_FIELDS) {
        const raw = (item as unknown as Record<string, unknown>)[field];
        values[field] = typeof raw === 'object' && raw !== null && 'toNumber' in (raw as object) ? Number(raw) : Number(raw ?? 0);
      }
      return {
        employeeId: item.employeeId,
        employeeNo: item.employee.employeeNo,
        employeeName: item.employee.name,
        workDate: item.workDate ? item.workDate.toISOString().slice(0, 10) : undefined,
        values,
      };
    });

    const exporter = this.exporters.find((e) => e.format === format);
    if (!exporter) throw new NotFoundException({ code: 'PAYROLL_EXPORT_FORMAT_UNSUPPORTED', message: `지원하지 않는 내보내기 형식입니다: ${format}` });

    const result = await exporter.export({ siteId, periodYearMonth, layoutType, columns, rows });

    await this.prisma.payrollExportRecord.create({
      data: {
        payrollCloseId: close.id,
        siteId,
        periodYearMonth,
        version: close.version,
        format: result.format,
        layoutType,
        columnMappingId,
        exportedBy,
        fileChecksum: result.checksum,
        rowCount: result.rowCount,
      },
    });

    return result;
  }
}
