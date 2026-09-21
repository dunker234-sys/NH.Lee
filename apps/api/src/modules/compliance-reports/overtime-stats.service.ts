import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly } from '../../common/time/week.util';

export interface ViolationHistoryRow {
  employeeId: string;
  employeeName: string;
  siteId: string;
  siteName: string;
  weekStartDate: Date;
  totalWorkMinutes: number;
  over40Minutes: number;
  alertStage: string;
}

export interface SiteOvertimeComparisonRow {
  siteId: string;
  siteName: string;
  totalOvertimeForPremiumMinutes: number;
  violationWeekCount: number;
  atRiskEmployeeCount: number;
}

/** "YYYY-MM" 또는 "YYYY-Qn"을 [start,end) 반달력일 범위로 바꾼다. */
function periodToDateRange(period: string): { start: string; end: string } {
  const quarterMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    const year = Number(quarterMatch[1]);
    const quarter = Number(quarterMatch[2]);
    const startMonth = (quarter - 1) * 3 + 1;
    const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
    const endMonth = startMonth + 3;
    const endYear = endMonth > 12 ? year + 1 : year;
    const endMonthNorm = endMonth > 12 ? endMonth - 12 : endMonth;
    const end = `${endYear}-${String(endMonthNorm).padStart(2, '0')}-01`;
    return { start, end };
  }
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month + 1;
    const endYear = endMonth > 12 ? year + 1 : year;
    const endMonthNorm = endMonth > 12 ? endMonth - 12 : endMonth;
    const end = `${endYear}-${String(endMonthNorm).padStart(2, '0')}-01`;
    return { start, end };
  }
  throw new Error(`알 수 없는 기간 형식입니다(YYYY-MM 또는 YYYY-Qn만 허용): ${period}`);
}

/**
 * 월/분기 초과근로 통계·사업장별 비교·위반 이력(요구사항서 4.4④). 이미
 * attendance_weekly에 계산돼 있는 alert_stage(캐시)·limit_violation_flag를
 * 그대로 읽는다 — 리포트 조회 시점에 정책값을 다시 조회해 재계산하지
 * 않는다(2초 이내 완료조건).
 */
@Injectable()
export class OvertimeStatsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveSiteIds(scope: OrgScope, siteId?: string): Promise<string[] | undefined> {
    assertScope(scope);
    if (siteId) {
      assertSiteInScope(scope, siteId);
      return [siteId];
    }
    return scope.kind === 'ALL' ? undefined : scope.siteIds;
  }

  async getViolationHistory(scope: OrgScope, from: string, to: string, siteId?: string): Promise<ViolationHistoryRow[]> {
    const siteIds = await this.resolveSiteIds(scope, siteId);
    const rows = await this.prisma.attendanceWeekly.findMany({
      where: {
        limitViolationFlag: true,
        weekStartDate: { gte: dateOnly(from), lte: dateOnly(to) },
        employee: siteIds ? { primarySiteId: { in: siteIds } } : undefined,
      },
      include: { employee: { select: { name: true, primarySiteId: true, primarySite: { select: { name: true } } } } },
      orderBy: { weekStartDate: 'desc' },
    });

    return rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      siteId: r.employee.primarySiteId,
      siteName: r.employee.primarySite.name,
      weekStartDate: r.weekStartDate,
      totalWorkMinutes: r.totalWorkMinutes,
      over40Minutes: r.over40Minutes,
      alertStage: r.alertStage,
    }));
  }

  async getSiteComparison(scope: OrgScope, period: string): Promise<SiteOvertimeComparisonRow[]> {
    const { start, end } = periodToDateRange(period);
    const siteIds = await this.resolveSiteIds(scope);

    const rows = await this.prisma.attendanceWeekly.findMany({
      where: {
        weekStartDate: { gte: dateOnly(start), lt: dateOnly(end) },
        employee: siteIds ? { primarySiteId: { in: siteIds } } : undefined,
      },
      select: {
        employeeId: true,
        totalOvertimeForPremiumMinutes: true,
        limitViolationFlag: true,
        alertStage: true,
        employee: { select: { primarySiteId: true, primarySite: { select: { name: true } } } },
      },
    });

    const bySite = new Map<
      string,
      { siteName: string; totalOvertimeForPremiumMinutes: number; violationWeekCount: number; atRiskEmployeeIds: Set<string> }
    >();
    for (const r of rows) {
      const key = r.employee.primarySiteId;
      const entry = bySite.get(key) ?? {
        siteName: r.employee.primarySite.name,
        totalOvertimeForPremiumMinutes: 0,
        violationWeekCount: 0,
        atRiskEmployeeIds: new Set<string>(),
      };
      entry.totalOvertimeForPremiumMinutes += r.totalOvertimeForPremiumMinutes;
      if (r.limitViolationFlag) entry.violationWeekCount += 1;
      if (r.alertStage === 'DANGER' || r.alertStage === 'EXCEEDED') entry.atRiskEmployeeIds.add(r.employeeId);
      bySite.set(key, entry);
    }

    return [...bySite.entries()].map(([siteId, v]) => ({
      siteId,
      siteName: v.siteName,
      totalOvertimeForPremiumMinutes: v.totalOvertimeForPremiumMinutes,
      violationWeekCount: v.violationWeekCount,
      atRiskEmployeeCount: v.atRiskEmployeeIds.size,
    }));
  }

  async exportViolationHistoryWorkbook(scope: OrgScope, from: string, to: string, siteId?: string): Promise<Buffer> {
    const rows = await this.getViolationHistory(scope, from, to, siteId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('52시간 위반 이력');
    sheet.addRow(['근로일(주 시작)', '사업장', '근로자', '주간 총 근로시간(분)', '40h초과분(분)', '알림단계']);
    for (const row of rows) {
      sheet.addRow([
        row.weekStartDate.toISOString().slice(0, 10),
        row.siteName,
        row.employeeName,
        row.totalWorkMinutes,
        row.over40Minutes,
        row.alertStage,
      ]);
    }

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
