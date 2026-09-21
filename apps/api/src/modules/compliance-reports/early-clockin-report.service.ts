import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';

export interface EarlyClockInReportRow {
  employeeId: string;
  employeeName: string;
  siteId: string;
  siteName: string;
  yearMonth: string;
  occurrenceCount: number;
  detectedAt: Date;
  resolvedAt: Date | null;
}

/** STEP6.5 배치 결과(early_clock_in_pattern_flag)를 그대로 읽는다 — 새 탐지 로직은 없다(요구사항서 4.4④②). */
@Injectable()
export class EarlyClockInReportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: OrgScope, yearMonth?: string, siteId?: string): Promise<EarlyClockInReportRow[]> {
    assertScope(scope);
    if (siteId) assertSiteInScope(scope, siteId);
    const siteIds = siteId ? [siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    const rows = await this.prisma.earlyClockInPatternFlag.findMany({
      where: { yearMonth, siteId: siteIds ? { in: siteIds } : undefined },
      include: { employee: { select: { name: true } }, site: { select: { name: true } } },
      orderBy: { detectedAt: 'desc' },
    });

    return rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      siteId: r.siteId,
      siteName: r.site.name,
      yearMonth: r.yearMonth,
      occurrenceCount: r.occurrenceCount,
      detectedAt: r.detectedAt,
      resolvedAt: r.resolvedAt,
    }));
  }
}
