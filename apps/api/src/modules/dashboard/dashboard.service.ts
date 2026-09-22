import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly, mondayOfWeek } from '../../common/time/week.util';

export interface HqDashboardSummary {
  totalHeadcount: number;
  dayOffCount: number;
  todayScheduledCount: number;
  todayCheckedInCount: number;
  todayAttendanceRatePercent: number;
  todayNoShowCount: number;
  atRiskEmployeeCount: number;
  pendingApprovalCount: number;
  fraudReviewQueueCount: number;
  unapprovedUnjudgedCount: number;
}

export interface SiteDashboardSummary {
  siteId: string;
  todayWorkingCount: number;
  dayOffCount: number;
  todayNoShowCount: number;
  pendingApprovalCount: number;
  atRiskEmployeeCount: number;
}

function todayKst(): string {
  const kstMs = Date.now() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10);
}

/**
 * 요구사항서 4.4⑤ 대시보드. 전부 이미 계산돼 있는 값(사전 집계 테이블 —
 * attendance_weekly.alert_stage 등)을 읽는 COUNT/GROUP BY 쿼리로만
 * 구성한다 — 대시보드 요청 시점에 정책값을 다시 조회하거나 근태를
 * 재계산하지 않는다(2초 이내 완료조건).
 *
 * ★ "이상 타각 검토 큐"는 punch_fraud_signal/review_note에 해소(dismiss)
 * 상태 컬럼이 없어(STEP4 스키마 갭), "오늘 발생한 신호 건수"로 근사한다 —
 * 실제 검토 완료 여부를 반영하지 못하는 알려진 한계다.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getHqDashboard(scope: OrgScope): Promise<HqDashboardSummary> {
    assertScope(scope);
    const siteIds = scope.kind === 'ALL' ? undefined : scope.siteIds;
    const today = todayKst();
    const todayDate = dateOnly(today);
    const weekStart = dateOnly(mondayOfWeek(today));

    const employeeSiteFilter = siteIds ? { primarySiteId: { in: siteIds } } : {};

    const [
      headcountSum,
      dayOffEmployeeIds,
      todayScheduledCount,
      todayCheckedInEmployeeIds,
      todayNoShowCount,
      atRiskEmployeeCount,
      // 연장근로 승인/정정신청 승인 화면 삭제(2026-09 수정사항)로 더 이상 집계하지
      // 않는다 — 파견 승인대기만 "승인 대기"로 남는다.
      pendingDispatch,
      fraudReviewQueueCount,
      unapprovedUnjudgedCount,
    ] = await Promise.all([
      this.prisma.site.aggregate({
        _sum: { headcountCache: true },
        where: siteIds ? { id: { in: siteIds } } : {},
      }),
      this.prisma.leaveRequest.findMany({
        where: { status: 'APPROVED', startDate: { lte: todayDate }, endDate: { gte: todayDate }, employee: employeeSiteFilter },
        select: { employeeId: true },
        distinct: ['employeeId'],
      }),
      this.prisma.schedule.count({
        where: { workDate: todayDate, status: 'CONFIRMED', siteId: siteIds ? { in: siteIds } : undefined },
      }),
      this.prisma.punchRaw.findMany({
        where: { workDate: todayDate, punchType: 'IN', siteId: siteIds ? { in: siteIds } : undefined },
        select: { employeeId: true },
        distinct: ['employeeId'],
      }),
      this.prisma.noShowNotificationTarget.count({ where: { workDate: todayDate, siteId: siteIds ? { in: siteIds } : undefined } }),
      this.prisma.attendanceWeekly.findMany({
        where: { weekStartDate: weekStart, alertStage: { in: ['DANGER', 'EXCEEDED'] }, employee: employeeSiteFilter },
        select: { employeeId: true },
        distinct: ['employeeId'],
      }),
      this.prisma.dispatchRequest.count({ where: { status: 'PENDING', employee: employeeSiteFilter } }),
      this.prisma.punchFraudSignal.count({ where: { detectedAt: { gte: todayDate }, punch: siteIds ? { siteId: { in: siteIds } } : {} } }),
      this.prisma.attendanceDaily.count({ where: { status: 'UNAPPROVED_ACTUAL', siteId: siteIds ? { in: siteIds } : undefined } }),
    ]);

    const todayAttendanceRatePercent =
      todayScheduledCount > 0 ? Math.round((todayCheckedInEmployeeIds.length / todayScheduledCount) * 1000) / 10 : 0;

    return {
      totalHeadcount: headcountSum._sum.headcountCache ?? 0,
      dayOffCount: dayOffEmployeeIds.length,
      todayScheduledCount,
      todayCheckedInCount: todayCheckedInEmployeeIds.length,
      todayAttendanceRatePercent,
      todayNoShowCount,
      atRiskEmployeeCount: atRiskEmployeeCount.length,
      pendingApprovalCount: pendingDispatch,
      fraudReviewQueueCount,
      unapprovedUnjudgedCount,
    };
  }

  async getSiteDashboard(scope: OrgScope, siteId: string): Promise<SiteDashboardSummary> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const today = todayKst();
    const todayDate = dateOnly(today);
    const weekStart = dateOnly(mondayOfWeek(today));
    const employeeSiteFilter = { primarySiteId: siteId };

    const [todayCheckedInEmployeeIds, dayOffEmployeeIds, todayNoShowCount, atRiskEmployeeIds, pendingDispatch] = await Promise.all([
      this.prisma.punchRaw.findMany({
        where: { workDate: todayDate, punchType: 'IN', siteId },
        select: { employeeId: true },
        distinct: ['employeeId'],
      }),
      this.prisma.leaveRequest.findMany({
        where: { status: 'APPROVED', startDate: { lte: todayDate }, endDate: { gte: todayDate }, employee: employeeSiteFilter },
        select: { employeeId: true },
        distinct: ['employeeId'],
      }),
      this.prisma.noShowNotificationTarget.count({ where: { workDate: todayDate, siteId } }),
      this.prisma.attendanceWeekly.findMany({
        where: { weekStartDate: weekStart, alertStage: { in: ['DANGER', 'EXCEEDED'] }, employee: employeeSiteFilter },
        select: { employeeId: true },
        distinct: ['employeeId'],
      }),
      this.prisma.dispatchRequest.count({ where: { status: 'PENDING', employee: employeeSiteFilter } }),
    ]);

    return {
      siteId,
      todayWorkingCount: todayCheckedInEmployeeIds.length,
      dayOffCount: dayOffEmployeeIds.length,
      todayNoShowCount,
      pendingApprovalCount: pendingDispatch,
      atRiskEmployeeCount: atRiskEmployeeIds.length,
    };
  }
}
