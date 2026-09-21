import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { monthRange } from '../../common/time/week.util';

export interface EmployeeUnapprovedOvertimeRow {
  employeeId: string;
  employeeName: string;
  unresolvedDayCount: number;
  totalUnapprovedMinutes: number;
}

export interface SiteUnapprovedOvertimeRow {
  siteId: string;
  siteName: string;
  unresolvedDayCount: number;
  totalUnapprovedMinutes: number;
  employeeCount: number;
}

/**
 * 미승인 초과 타각 월간 리포트 — 승인 절차가 운영되지 않는 사업장을
 * 식별하는 게 목적이라 사업장 단위 롤업을 기본 뷰로 둔다. AttendanceMonthly.
 * totals(Json)는 파싱하지 않고 AttendanceDaily(타입화된 컬럼)를 직접 집계한다.
 */
@Injectable()
export class ApprovalReportService {
  constructor(private readonly prisma: PrismaService) {}

  async unapprovedOvertimeReport(
    scope: OrgScope,
    yearMonth: string,
    siteId?: string,
  ): Promise<EmployeeUnapprovedOvertimeRow[] | SiteUnapprovedOvertimeRow[]> {
    assertScope(scope);
    const { start, end } = monthRange(yearMonth);

    if (siteId) {
      assertSiteInScope(scope, siteId);
      const rows = await this.prisma.attendanceDaily.findMany({
        where: { siteId, status: 'UNAPPROVED_ACTUAL', workDate: { gte: start, lt: end } },
        select: { employeeId: true, unapprovedOvertimeMinutes: true, employee: { select: { name: true } } },
      });
      const byEmployee = new Map<string, EmployeeUnapprovedOvertimeRow>();
      for (const r of rows) {
        const entry = byEmployee.get(r.employeeId) ?? {
          employeeId: r.employeeId,
          employeeName: r.employee.name,
          unresolvedDayCount: 0,
          totalUnapprovedMinutes: 0,
        };
        entry.unresolvedDayCount += 1;
        entry.totalUnapprovedMinutes += r.unapprovedOvertimeMinutes;
        byEmployee.set(r.employeeId, entry);
      }
      return [...byEmployee.values()];
    }

    const siteIds = scope.kind === 'ALL' ? undefined : scope.siteIds;
    const rows = await this.prisma.attendanceDaily.findMany({
      where: { status: 'UNAPPROVED_ACTUAL', workDate: { gte: start, lt: end }, siteId: siteIds ? { in: siteIds } : undefined },
      select: { siteId: true, employeeId: true, unapprovedOvertimeMinutes: true, site: { select: { name: true } } },
    });
    const bySite = new Map<string, SiteUnapprovedOvertimeRow & { employeeIds: Set<string> }>();
    for (const r of rows) {
      const entry = bySite.get(r.siteId) ?? {
        siteId: r.siteId,
        siteName: r.site.name,
        unresolvedDayCount: 0,
        totalUnapprovedMinutes: 0,
        employeeCount: 0,
        employeeIds: new Set<string>(),
      };
      entry.unresolvedDayCount += 1;
      entry.totalUnapprovedMinutes += r.unapprovedOvertimeMinutes;
      entry.employeeIds.add(r.employeeId);
      bySite.set(r.siteId, entry);
    }
    return [...bySite.values()].map(({ employeeIds, ...rest }) => ({ ...rest, employeeCount: employeeIds.size }));
  }
}
