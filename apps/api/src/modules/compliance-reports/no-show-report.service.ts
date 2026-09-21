import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly } from '../../common/time/week.util';

export interface NoShowReportRow {
  employeeId: string;
  employeeName: string;
  siteId: string;
  siteName: string;
  workDate: Date;
  detectedAt: Date;
  notifiedAt: Date | null;
}

/** STEP4 배치 결과(no_show_notification_target)를 그대로 읽는다 — 새 판정 로직은 없다(요구사항서 4.4④①). */
@Injectable()
export class NoShowReportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: OrgScope, from: string, to: string, siteId?: string): Promise<NoShowReportRow[]> {
    assertScope(scope);
    if (siteId) assertSiteInScope(scope, siteId);
    const siteIds = siteId ? [siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    const rows = await this.prisma.noShowNotificationTarget.findMany({
      where: {
        workDate: { gte: dateOnly(from), lte: dateOnly(to) },
        siteId: siteIds ? { in: siteIds } : undefined,
      },
      include: { employee: { select: { name: true } }, site: { select: { name: true } } },
      orderBy: { workDate: 'desc' },
    });

    return rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      siteId: r.siteId,
      siteName: r.site.name,
      workDate: r.workDate,
      detectedAt: r.detectedAt,
      notifiedAt: r.notifiedAt,
    }));
  }
}
