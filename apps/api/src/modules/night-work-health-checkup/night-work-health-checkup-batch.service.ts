import { Injectable, Logger } from '@nestjs/common';
import { determineNightWorkHealthCheckupEligibility, NightWorkSession } from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NightWorkHealthCheckupPolicyResolverService } from '../../common/policy/night-work-health-checkup-policy-resolver.service';
import { NotificationService } from '../notifications/notification.service';
import { dateOnly } from '../../common/time/week.util';

export interface NightWorkHealthCheckupEvalResult {
  eligible: boolean;
  newlyEligible: boolean;
}

export interface NightWorkHealthCheckupBatchResult {
  processedCount: number;
  newlyEligibleCount: number;
}

/**
 * 야간작업 특수건강진단 대상자 판정(산안법 §130, 시행규칙 별표22 제4호).
 * 6개월치 punch_raw로부터 "그날의 연속 작업 세션"을 만든다 — 근태 정정·
 * 미승인 실적 판정과 무관하게 실제 타각 그 자체를 기준으로 한다(이
 * 판정은 임금·형사처벌이 아니라 산업안전보건 조치 대상자 선별이 목적이라,
 * daily-attendance 엔진의 승인/휴게 규칙을 다시 태우지 않고 IN~OUT 원시
 * 구간을 그대로 쓴다 — 알려진 단순화, 사이 휴게로 실제로는 끊긴 시간도
 * "연속"으로 셀 수 있어 과다 판정 방향의 보수적 근사다).
 */
@Injectable()
export class NightWorkHealthCheckupBatchService {
  private readonly logger = new Logger(NightWorkHealthCheckupBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: NightWorkHealthCheckupPolicyResolverService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * ★ 자동 월간 스케줄링(BullMQ repeat)은 이번 STEP에서 하지 않는다 —
   * EarlyClockInPatternService의 선례(파일럿 검증 후 후속 작업)를 그대로
   * 따른다. 지금은 수동/시스템 배치 트리거로만 노출한다(컨트롤러 참고).
   */
  async recalculateForAllActiveEmployees(asOfDate: string, siteIds?: string[]): Promise<NightWorkHealthCheckupBatchResult> {
    const employees = await this.prisma.employee.findMany({
      where: { status: 'ACTIVE', primarySiteId: siteIds ? { in: siteIds } : undefined },
      select: { id: true },
    });

    let newlyEligibleCount = 0;
    for (const { id: employeeId } of employees) {
      const result = await this.recalculateForEmployee(employeeId, asOfDate);
      if (result.newlyEligible) newlyEligibleCount += 1;
    }
    return { processedCount: employees.length, newlyEligibleCount };
  }

  async recalculateForEmployee(employeeId: string, asOfDate: string): Promise<NightWorkHealthCheckupEvalResult> {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { name: true, employeeNo: true, primarySiteId: true },
    });

    const policy = await this.policyResolver.resolve(employee.primarySiteId, dateOnly(asOfDate));
    const rangeStart = subtractMonths(asOfDate, policy.monthsInWindow);

    const punches = await this.prisma.punchRaw.findMany({
      where: {
        employeeId,
        workDate: { gte: dateOnly(rangeStart), lte: dateOnly(asOfDate) },
        punchType: { in: ['IN', 'OUT'] },
      },
      orderBy: [{ workDate: 'asc' }, { recordedAt: 'asc' }],
    });

    const sessions = this.buildDailySessions(punches);
    const result = determineNightWorkHealthCheckupEligibility({ sessions, policy });

    const previous = await this.prisma.nightWorkHealthCheckupStatus.findUnique({ where: { employeeId } });
    const newlyEligible = result.eligible && !(previous?.eligible ?? false);

    const data = {
      siteId: employee.primarySiteId,
      windowEndDate: dateOnly(asOfDate),
      criterion1Count: result.criterion1Count,
      criterion1Met: result.criterion1Met,
      criterion2TotalMinutes: result.criterion2TotalMinutes,
      criterion2Met: result.criterion2Met,
      eligible: result.eligible,
      calculatedAt: new Date(),
    };
    await this.prisma.nightWorkHealthCheckupStatus.upsert({
      where: { employeeId },
      create: { employeeId, ...data },
      update: data,
    });

    if (newlyEligible) {
      await this.notifyTargets(employeeId, employee, result);
    }

    return { eligible: result.eligible, newlyEligible };
  }

  private buildDailySessions(punches: { workDate: Date; recordedAt: Date; punchType: string }[]): NightWorkSession[] {
    const byDate = new Map<string, { firstIn?: Date; lastOut?: Date }>();
    for (const p of punches) {
      const key = p.workDate.toISOString().slice(0, 10);
      const entry = byDate.get(key) ?? {};
      if (p.punchType === 'IN' && (!entry.firstIn || p.recordedAt < entry.firstIn)) entry.firstIn = p.recordedAt;
      if (p.punchType === 'OUT' && (!entry.lastOut || p.recordedAt > entry.lastOut)) entry.lastOut = p.recordedAt;
      byDate.set(key, entry);
    }

    const sessions: NightWorkSession[] = [];
    for (const { firstIn, lastOut } of byDate.values()) {
      if (firstIn && lastOut && lastOut > firstIn) {
        sessions.push({ startAt: firstIn.toISOString(), endAt: lastOut.toISOString() });
      }
    }
    return sessions;
  }

  private async notifyTargets(
    employeeId: string,
    employee: { name: string; employeeNo: string; primarySiteId: string },
    result: ReturnType<typeof determineNightWorkHealthCheckupEligibility>,
  ): Promise<void> {
    const criteriaMet = [result.criterion1Met ? '①' : null, result.criterion2Met ? '②' : null].filter(Boolean).join(', ');

    const siteManagers = await this.prisma.employee.findMany({
      where: {
        role: 'SITE_MANAGER',
        status: 'ACTIVE',
        siteAssignments: { some: { siteId: employee.primarySiteId, OR: [{ endDate: null }] } },
      },
      select: { id: true },
    });
    const hqHr = await this.prisma.employee.findMany({ where: { role: 'HQ_HR', status: 'ACTIVE' }, select: { id: true } });
    const targetPeriod = `${new Date().toISOString().slice(0, 7)}#${employeeId}`;

    for (const recipient of [...siteManagers, ...hqHr]) {
      await this.notificationService.notify(
        'NIGHT_WORK_HEALTH_CHECKUP_TARGET',
        recipient.id,
        { employeeName: employee.name, employeeNo: employee.employeeNo, criteriaMet },
        { targetPeriod, stage: 'ELIGIBLE' },
      );
    }

    this.logger.log(`[${employee.employeeNo}] 야간작업 특수건강진단 대상자 신규 판정(${criteriaMet})`);
  }
}

function subtractMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 - months, d));
  return date.toISOString().slice(0, 10);
}
