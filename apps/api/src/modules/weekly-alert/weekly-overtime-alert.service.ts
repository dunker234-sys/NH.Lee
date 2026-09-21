import { Injectable, Logger } from '@nestjs/common';
import { determineWeeklyAlertStage, WeeklyAlertStage } from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WeeklyAlertPolicyResolverService } from '../../common/policy/weekly-alert-policy-resolver.service';
import { NotificationService } from '../notifications/notification.service';
import { dateOnly } from '../../common/time/week.util';
import { WeeklyAlertRecipientResolverService } from './weekly-alert-recipient-resolver.service';

export interface WeeklyOvertimeAlertResult {
  stage: WeeklyAlertStage;
  notifiedEmployeeIds: string[];
}

/**
 * 요구사항서 4.4② 알림 임계 판정 + 발송. 타각 시 실시간 재계산
 * (RecalculationConsumer 후처리) 및 매일 야간 정합성 배치
 * (WeeklyAlertBatchService) 양쪽에서 호출한다 — 어느 경로로 호출되든
 * NotificationService.notify()의 dedup(동일 recipient·type·targetPeriod·
 * stage)이 "동일 주차 동일 단계 1회만 발송"을 보장한다.
 *
 * targetPeriod에 weekStartDate만이 아니라 employeeId도 넣는다 — 그렇지
 * 않으면 같은 사업장관리자가 같은 주에 서로 다른 두 직원의 WARNING 알림을
 * 받을 때 두 번째 알림이 (recipient, type, targetPeriod, stage) 동일로
 * 오탐 dedup되어 사라진다.
 */
@Injectable()
export class WeeklyOvertimeAlertService {
  private readonly logger = new Logger(WeeklyOvertimeAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly weeklyAlertPolicyResolver: WeeklyAlertPolicyResolverService,
    private readonly recipientResolver: WeeklyAlertRecipientResolverService,
    private readonly notificationService: NotificationService,
  ) {}

  async evaluateAndNotify(employeeId: string, weekStartDate: string): Promise<WeeklyOvertimeAlertResult | null> {
    const weekly = await this.prisma.attendanceWeekly.findUnique({
      where: { employeeId_weekStartDate: { employeeId, weekStartDate: dateOnly(weekStartDate) } },
    });
    // 유연근로제 주는 표준 52h 판정 자체를 건너뛴 주라(flexibleWorkSkipped),
    // 이 알림도 함께 건너뛴다 — 별도 상한 기준은 STEP9 범위 밖(RULES.md §13 갭).
    if (!weekly || weekly.flexibleWorkSkipped) return null;

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { name: true, employeeNo: true, primarySiteId: true, contractedWorkMinutes: true },
    });

    const asOfDate = dateOnly(weekStartDate);
    const alertPolicy = await this.weeklyAlertPolicyResolver.resolve(employee.primarySiteId, asOfDate);
    // 소정근로시간이 없는 직원(예: 일용직)은 40h(법정 기준)로 간주한다 —
    // 상대값 임계 계산이 실패하지 않도록 하는 보수적 기본값(RULES.md §13 참고).
    const contractedWeeklyMinutes = employee.contractedWorkMinutes ?? 2400;

    const { stage } = determineWeeklyAlertStage({
      actualWeeklyMinutes: weekly.totalWorkMinutes,
      contractedWeeklyMinutes,
      limitViolated: weekly.limitViolationFlag,
      policy: alertPolicy,
    });

    // 대시보드·리포트가 매 요청마다 재계산하지 않도록 캐시한다(요구사항서
    // 4.4⑥) — stage가 NONE이어도 갱신한다. 안 그러면 실적이 줄어(정정 등)
    // 더 이상 위험군이 아니게 된 직원이 계속 위험군으로 잡힌다.
    if (weekly.alertStage !== stage) {
      await this.prisma.attendanceWeekly.update({
        where: { employeeId_weekStartDate: { employeeId, weekStartDate: dateOnly(weekStartDate) } },
        data: { alertStage: stage },
      });
    }

    if (stage === 'NONE') return null;

    const targetPeriod = `${weekStartDate}#${employeeId}`;
    const payload = {
      employeeName: employee.name,
      employeeNo: employee.employeeNo,
      weekStartDate,
      actualWeeklyMinutes: weekly.totalWorkMinutes,
      stage,
    };

    const notifiedEmployeeIds = [employeeId];
    await this.notificationService.notify('WEEKLY_OVERTIME_ALERT', employeeId, payload, { targetPeriod, stage });

    const escalationRecipients = await this.recipientResolver.resolveEscalationRecipients(
      employee.primarySiteId,
      stage,
      asOfDate,
    );
    for (const recipientId of escalationRecipients) {
      await this.notificationService.notify('WEEKLY_OVERTIME_ALERT', recipientId, payload, { targetPeriod, stage });
      notifiedEmployeeIds.push(recipientId);
    }

    this.logger.log(`[${employee.employeeNo} ${weekStartDate}] 52시간 알림 단계=${stage}, 수신자 ${notifiedEmployeeIds.length}명`);
    return { stage, notifiedEmployeeIds };
  }
}
