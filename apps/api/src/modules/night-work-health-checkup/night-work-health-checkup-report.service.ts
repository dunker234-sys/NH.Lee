import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';

export interface NightWorkHealthCheckupTargetRow {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  siteId: string;
  siteName: string;
  criterion1Count: number;
  criterion1Met: boolean;
  criterion2TotalMinutes: number;
  criterion2Met: boolean;
  windowEndDate: Date;
  calculatedAt: Date;
}

/** 사전 계산된 night_work_health_checkup_status만 읽는다 — 리포트 조회는 6개월치 punch_raw를 다시 훑지 않는다(요구사항서 4.4⑥). */
@Injectable()
export class NightWorkHealthCheckupReportService {
  constructor(private readonly prisma: PrismaService) {}

  async listTargets(scope: OrgScope, siteId?: string): Promise<NightWorkHealthCheckupTargetRow[]> {
    assertScope(scope);
    if (siteId) assertSiteInScope(scope, siteId);
    const siteIds = siteId ? [siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    const rows = await this.prisma.nightWorkHealthCheckupStatus.findMany({
      where: { eligible: true, siteId: siteIds ? { in: siteIds } : undefined },
      include: { employee: { select: { name: true, employeeNo: true } }, site: { select: { name: true } } },
      orderBy: { calculatedAt: 'desc' },
    });

    return rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      employeeNo: r.employee.employeeNo,
      siteId: r.siteId,
      siteName: r.site.name,
      criterion1Count: r.criterion1Count,
      criterion1Met: r.criterion1Met,
      criterion2TotalMinutes: r.criterion2TotalMinutes,
      criterion2Met: r.criterion2Met,
      windowEndDate: r.windowEndDate,
      calculatedAt: r.calculatedAt,
    }));
  }
}
