import { Injectable, Logger } from '@nestjs/common';
import { projectWeeklyOvertime, suggestScheduleAdjustments } from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WeeklyAlertPolicyResolverService } from '../../common/policy/weekly-alert-policy-resolver.service';
import { NotificationService } from '../notifications/notification.service';
import { addDays, dateOnly, enumerateDates } from '../../common/time/week.util';
import { WeeklyAlertRecipientResolverService } from './weekly-alert-recipient-resolver.service';

export interface WeeklyOvertimeProjectionEvalResult {
  projected: boolean;
}

/**
 * 예측 알림(요구사항서 4.4③): 남은 계획근태를 실적에 합산했을 때 40h+12h
 * 한도 위반이 예상되면(EXCEEDED 예측) 사업장 관리자에게 사전 경고하고
 * 조정 가능한 스케줄 후보를 함께 제시한다. "위험" 정도의 예측까지는
 * 알리지 않는다 — 이미 evaluateAndNotify()가 실적 기준으로 매일 그
 * 단계까지는 알리고 있어, 여기서 또 알리면 같은 사실을 두 경로가 다른
 * 문구로 중복 통지하게 된다.
 */
@Injectable()
export class WeeklyOvertimeProjectionService {
  private readonly logger = new Logger(WeeklyOvertimeProjectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly weeklyAlertPolicyResolver: WeeklyAlertPolicyResolverService,
    private readonly recipientResolver: WeeklyAlertRecipientResolverService,
    private readonly notificationService: NotificationService,
  ) {}

  async evaluateAndNotify(employeeId: string, weekStartDate: string, todayDate: string): Promise<WeeklyOvertimeProjectionEvalResult> {
    const weekEndDate = addDays(weekStartDate, 6);
    if (todayDate > weekEndDate) return { projected: false }; // 이미 지난 주 — 예측할 미래가 없다

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { name: true, employeeNo: true, primarySiteId: true, contractedWorkMinutes: true },
    });

    const remainingStartDate = todayDate > weekStartDate ? todayDate : weekStartDate;
    const [dailyRows, scheduleRows] = await Promise.all([
      this.prisma.attendanceDaily.findMany({
        where: { employeeId, workDate: { gte: dateOnly(weekStartDate), lt: dateOnly(remainingStartDate) } },
      }),
      this.prisma.schedule.findMany({
        where: { employeeId, workDate: { gte: dateOnly(remainingStartDate), lte: dateOnly(weekEndDate) } },
      }),
    ]);

    if (scheduleRows.length === 0) return { projected: false }; // 남은 계획이 없으면 예측할 것이 없다

    const dailyByDate = new Map(dailyRows.map((r) => [r.workDate.toISOString().slice(0, 10), r.actualWorkMinutes]));
    const actualDailyTotals = enumerateDates(weekStartDate, addDays(remainingStartDate, -1)).map((d) => ({
      date: d,
      totalWorkMinutes: dailyByDate.get(d) ?? 0,
    }));

    const scheduledMinutesByDate = new Map<string, number>();
    for (const s of scheduleRows) {
      const d = s.workDate.toISOString().slice(0, 10);
      const span = Math.floor((s.plannedEndAt.getTime() - s.plannedStartAt.getTime()) / 60000);
      const minutes = Math.max(0, span - s.plannedBreakMinutes);
      scheduledMinutesByDate.set(d, (scheduledMinutesByDate.get(d) ?? 0) + minutes);
    }
    const remainingScheduledDailyTotals = [...scheduledMinutesByDate.entries()].map(([date, totalWorkMinutes]) => ({
      date,
      totalWorkMinutes,
    }));

    const asOfDate = dateOnly(weekStartDate);
    const alertPolicy = await this.weeklyAlertPolicyResolver.resolve(employee.primarySiteId, asOfDate);
    const contractedWeeklyMinutes = employee.contractedWorkMinutes ?? 2400;

    const projection = projectWeeklyOvertime({
      actualDailyTotals,
      remainingScheduledDailyTotals,
      contractedWeeklyMinutes,
      policy: alertPolicy,
    });

    if (projection.projectedStage !== 'EXCEEDED') return { projected: false };

    const reduceByMinutes = projection.projectedExcessOver40Minutes - alertPolicy.weeklyOvertimeCapMinutes;
    const remainingScheduleEntries = remainingScheduledDailyTotals.map((d) => ({ date: d.date, scheduledMinutes: d.totalWorkMinutes }));
    const suggestion = suggestScheduleAdjustments(remainingScheduleEntries, reduceByMinutes);

    const targetPeriod = `${weekStartDate}#${employeeId}`;
    const payload = {
      employeeName: employee.name,
      employeeNo: employee.employeeNo,
      weekStartDate,
      projectedStage: projection.projectedStage,
      projectedTotalMinutes: projection.projectedTotalMinutes,
      suggestedAdjustments: suggestion.candidates,
      fullyResolvedBySuggestion: suggestion.fullyResolved,
    };

    const siteManagers = await this.recipientResolver.resolveEscalationRecipients(employee.primarySiteId, 'WARNING', asOfDate);
    for (const recipientId of siteManagers) {
      await this.notificationService.notify('WEEKLY_OVERTIME_PROJECTED', recipientId, payload, {
        targetPeriod,
        stage: 'PROJECTED_EXCEEDED',
      });
    }

    this.logger.log(`[${employee.employeeNo} ${weekStartDate}] 초과 예측 — 사업장 관리자 ${siteManagers.length}명에게 사전 경고`);
    return { projected: true };
  }
}
