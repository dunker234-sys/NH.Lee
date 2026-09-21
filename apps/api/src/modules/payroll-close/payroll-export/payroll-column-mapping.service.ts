import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PayrollExportColumn } from './payroll-exporter.interface';

/** 사업장별 매핑이 없을 때 쓰는 전사 기본 컬럼 구성. */
export const DEFAULT_MONTHLY_COLUMNS: PayrollExportColumn[] = [
  { sourceField: 'scheduledWorkMinutes', header: '소정근로시간(분)', order: 1, unit: 'MINUTES' },
  { sourceField: 'approvedOvertimeMinutes', header: '연장근로시간-승인(분)', order: 2, unit: 'MINUTES' },
  { sourceField: 'unapprovedOvertimeMinutes', header: '연장근로시간-미승인(분)', order: 3, unit: 'MINUTES' },
  { sourceField: 'nightWorkMinutes', header: '야간근로시간(분)', order: 4, unit: 'MINUTES' },
  { sourceField: 'holidayWorkMinutesNormal', header: '휴일근로시간-8h이내(분)', order: 5, unit: 'MINUTES' },
  { sourceField: 'holidayWorkMinutesExcess', header: '휴일근로시간-8h초과(분)', order: 6, unit: 'MINUTES' },
  { sourceField: 'absenceDays', header: '결근일수', order: 7, unit: 'DAYS' },
  { sourceField: 'latenessDays', header: '지각일수', order: 8, unit: 'DAYS' },
  { sourceField: 'earlyLeaveDays', header: '조퇴일수', order: 9, unit: 'DAYS' },
  { sourceField: 'paidLeaveDays', header: '유급휴가일수', order: 10, unit: 'DAYS' },
  { sourceField: 'unpaidLeaveDays', header: '무급휴가일수', order: 11, unit: 'DAYS' },
  { sourceField: 'weeklyPaidRestEligibleCount', header: '주휴대상주수', order: 12, unit: 'DAYS' },
  { sourceField: 'weeklyPaidRestMinutes', header: '주휴시간(분)', order: 13, unit: 'MINUTES' },
  { sourceField: 'basePayAmount', header: '기본급(원)', order: 14, unit: 'KRW' },
  { sourceField: 'overtimePayAmount', header: '연장근로수당(원)', order: 15, unit: 'KRW' },
  { sourceField: 'nightPayAmount', header: '야간근로수당(원)', order: 16, unit: 'KRW' },
  { sourceField: 'holidayPayAmount', header: '휴일근로수당(원)', order: 17, unit: 'KRW' },
  { sourceField: 'weeklyPaidRestPayAmount', header: '주휴수당(원)', order: 18, unit: 'KRW' },
  { sourceField: 'totalPayAmount', header: '지급액합계(원, 참고용)', order: 19, unit: 'KRW' },
];

export const DEFAULT_DAILY_COLUMNS: PayrollExportColumn[] = DEFAULT_MONTHLY_COLUMNS.filter(
  (c) => !['weeklyPaidRestEligibleCount', 'weeklyPaidRestMinutes', 'weeklyPaidRestPayAmount'].includes(c.sourceField),
);

@Injectable()
export class PayrollColumnMappingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveColumns(siteId: string, layoutType: 'MONTHLY' | 'DAILY', columnMappingId?: string): Promise<PayrollExportColumn[]> {
    if (columnMappingId) {
      const mapping = await this.prisma.payrollColumnMapping.findUniqueOrThrow({ where: { id: columnMappingId } });
      return mapping.columns as unknown as PayrollExportColumn[];
    }
    const siteDefault = await this.prisma.payrollColumnMapping.findFirst({ where: { siteId, layoutType, isDefault: true } });
    if (siteDefault) return siteDefault.columns as unknown as PayrollExportColumn[];
    const orgDefault = await this.prisma.payrollColumnMapping.findFirst({ where: { siteId: null, layoutType, isDefault: true } });
    if (orgDefault) return orgDefault.columns as unknown as PayrollExportColumn[];
    return layoutType === 'DAILY' ? DEFAULT_DAILY_COLUMNS : DEFAULT_MONTHLY_COLUMNS;
  }

  async create(input: { name: string; layoutType: 'MONTHLY' | 'DAILY'; siteId?: string; columns: PayrollExportColumn[]; isDefault?: boolean; createdBy: string }) {
    return this.prisma.payrollColumnMapping.create({
      data: {
        name: input.name,
        layoutType: input.layoutType,
        siteId: input.siteId,
        columns: input.columns as unknown as object,
        isDefault: input.isDefault ?? false,
        createdBy: input.createdBy,
      },
    });
  }

  async list(siteId?: string) {
    return this.prisma.payrollColumnMapping.findMany({ where: siteId ? { OR: [{ siteId }, { siteId: null }] } : undefined });
  }
}
