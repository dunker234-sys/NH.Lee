import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalPolicyResolverService } from '../../common/policy/approval-policy-resolver.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly, monthRange } from '../../common/time/week.util';
import { NotificationService } from '../notifications/notification.service';
import { ApprovalLineResolverService } from './approval-line-resolver.service';

export interface EarlyClockInDetectionResult {
  flaggedCount: number;
}

/**
 * 조기출근 반복 패턴 탐지. 요구사항서 4.6 §3: 조기 타각도 전량 산입되므로
 * (근기법 제50조③ — 실근로시간은 지휘·감독 아래 실제 제공된 시간 기준),
 * 이 감지는 "차단"이 아니라 "관행적 조기근로의 사후 정리 요청"이다.
 *
 * ★ BullMQ 반복 잡 자동 등록은 이번 STEP에서 하지 않는다(파일럿 검증 후
 * 후속 작업 — no-show-schedule.service.ts를 참고해 5줄이면 된다). 지금은
 * detectForMonth()를 수동/테스트 트리거로만 노출한다. no-show-detection의
 * "탐지만 하고 알림 안 나감" 미완성 패턴을 반복하지 않기 위해, 여기서는
 * 플래그를 만든 즉시 notify()를 직접 호출한다.
 */
@Injectable()
export class EarlyClockInPatternService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: ApprovalPolicyResolverService,
    private readonly notificationService: NotificationService,
    private readonly approvalLine: ApprovalLineResolverService,
  ) {}

  async detectForMonth(scope: OrgScope, siteId: string | undefined, yearMonth: string): Promise<EarlyClockInDetectionResult> {
    assertScope(scope);
    if (siteId) assertSiteInScope(scope, siteId);
    const siteIds = siteId ? [siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    const { start, end } = monthRange(yearMonth);
    const schedules = await this.prisma.schedule.findMany({
      where: {
        status: 'CONFIRMED',
        workDate: { gte: start, lt: end },
        siteId: siteIds ? { in: siteIds } : undefined,
      },
    });

    const occurrenceByEmployeeSite = new Map<string, { employeeId: string; siteId: string; count: number }>();
    const policyCache = new Map<string, number>();

    for (const schedule of schedules) {
      let thresholdMinutes = policyCache.get(schedule.siteId);
      if (thresholdMinutes === undefined) {
        const policy = await this.policyResolver.resolve(schedule.siteId, schedule.workDate);
        thresholdMinutes = policy.earlyClockInMinutesThreshold;
        policyCache.set(schedule.siteId, thresholdMinutes);
      }

      const earliestAllowed = new Date(schedule.plannedStartAt.getTime() - thresholdMinutes * 60_000);
      const punch = await this.prisma.punchRaw.findFirst({
        where: { employeeId: schedule.employeeId, workDate: schedule.workDate, punchType: 'IN' },
        orderBy: { recordedAt: 'asc' },
      });
      if (!punch || punch.recordedAt.getTime() >= earliestAllowed.getTime()) continue;

      const key = `${schedule.employeeId}:${schedule.siteId}`;
      const existing = occurrenceByEmployeeSite.get(key);
      if (existing) existing.count += 1;
      else occurrenceByEmployeeSite.set(key, { employeeId: schedule.employeeId, siteId: schedule.siteId, count: 1 });
    }

    let flaggedCount = 0;
    for (const { employeeId, siteId: occSiteId, count } of occurrenceByEmployeeSite.values()) {
      const policy = await this.policyResolver.resolve(occSiteId, dateOnly(`${yearMonth}-01`));
      if (count < policy.earlyClockInMonthlyOccurrenceThreshold) continue;

      await this.prisma.earlyClockInPatternFlag.upsert({
        where: { employeeId_yearMonth: { employeeId, yearMonth } },
        create: { employeeId, siteId: occSiteId, yearMonth, occurrenceCount: count },
        update: { occurrenceCount: count, siteId: occSiteId },
      });
      flaggedCount += 1;

      const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { name: true } });
      const approvers = await this.approvalLine.resolveApprovers(occSiteId, dateOnly(`${yearMonth}-01`));
      for (const approver of approvers) {
        await this.notificationService.notify('EARLY_CLOCKIN_PATTERN_DETECTED', approver.employeeId, {
          employeeName: employee.name,
          yearMonth,
          occurrenceCount: count,
        });
      }
    }

    return { flaggedCount };
  }
}
