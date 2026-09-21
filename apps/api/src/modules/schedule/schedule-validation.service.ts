import { Injectable } from '@nestjs/common';
import { Schedule } from '@prisma/client';
import {
  CoreRulesError,
  FlexibleWorkAgreementMissingError,
  FlexibleWorkNotEligibleError,
  WorkerProfile,
  assertFlexibleWorkEligible,
  checkBiweeklyFlexibleWork,
  checkQuarterlyFlexibleWork,
  checkSemiannualFlexibleWork,
  checkWeeklyLimitViolation,
  checkConsecutiveWorkdayLimit,
  checkConsecutiveRestBetweenShifts,
  checkPlannedBreakSufficiency,
} from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeeProtectedStatusRepository } from '../../common/employee-protected-status/employee-protected-status.repository';
import { SchedulePolicy, SchedulePolicyResolverService } from '../../common/policy/schedule-policy-resolver.service';
import { SiteLaborAgreementResolverService } from '../../common/policy/site-labor-agreement-resolver.service';
import { deriveWorkDateString } from '../../common/time/work-date.util';
import { addDays, dateOnly, mondayOfWeek } from '../../common/time/week.util';
import { ScheduleAggregationService } from './schedule-aggregation.service';
import { ScheduleValidationViolation } from './errors/schedule-errors';

export interface ScheduleValidationTarget {
  id: string;
  employeeId: string;
  siteId: string;
  shiftTemplateId: string | null;
  plannedStartAt: Date;
  plannedEndAt: Date;
  plannedBreakMinutes: number;
}

export interface ScheduleValidationResult {
  hardBlocks: ScheduleValidationViolation[];
  softWarnings: ScheduleValidationViolation[];
}

function ageAsOf(birthDate: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthdayThisYear =
    asOf.getUTCMonth() < birthDate.getUTCMonth() ||
    (asOf.getUTCMonth() === birthDate.getUTCMonth() && asOf.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

/**
 * 저장/확정 시점 즉시 검증 오케스트레이션(§3.5). packages/core-rules의
 * 순수 함수를 호출하되, DB 조회(직원 생년월일·보호상태·서면합의·주변
 * 스케줄 창)는 이 서비스가 맡는다.
 */
@Injectable()
export class ScheduleValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: SchedulePolicyResolverService,
    private readonly agreementResolver: SiteLaborAgreementResolverService,
    private readonly aggregation: ScheduleAggregationService,
    private readonly protectedStatusRepo: EmployeeProtectedStatusRepository,
  ) {}

  /**
   * skipSoftWarnings: 편성 생성(roster-generation)은 hard-block만 필요하다 —
   * soft-warning 계산은 직원당 순차 DB 왕복(창 조회·템플릿 조회·생년월일
   * 조회)이 여러 번 붙어 30명×30일 벌크 생성의 3초 예산을 위협한다. 실제로
   * 쓰지 않는 결과를 위해 그 비용을 치르지 않는다 — hard-block 판정 자체는
   * 전혀 건너뛰지 않는다.
   */
  async validate(
    targets: ScheduleValidationTarget[],
    options: { noticeGivenAt?: Date; skipSoftWarnings?: boolean } = {},
  ): Promise<ScheduleValidationResult> {
    const noticeGivenAt = options.noticeGivenAt ?? new Date();
    const hardBlocks: ScheduleValidationViolation[] = [];
    const softWarnings: ScheduleValidationViolation[] = [];
    if (targets.length === 0) return { hardBlocks, softWarnings };

    const templateIds = [...new Set(targets.map((t) => t.shiftTemplateId).filter((id): id is string => Boolean(id)))];
    const templates = await this.prisma.shiftTemplate.findMany({ where: { id: { in: templateIds } } });
    const templateById = new Map(templates.map((t) => [t.id, t]));

    // --- Hard block: 개별 배정마다 미성년/임신/서면합의 게이트 ---
    for (const target of targets) {
      const template = target.shiftTemplateId ? templateById.get(target.shiftTemplateId) : undefined;
      const flexibleWorkType = template?.flexibleWorkType;
      if (!flexibleWorkType) continue;

      const workDate = deriveWorkDateString(target.plannedStartAt);
      const employee = await this.prisma.employee.findUniqueOrThrow({
        where: { id: target.employeeId },
        select: { birthDate: true },
      });

      if (employee.birthDate === null) {
        hardBlocks.push({
          scheduleId: target.id,
          code: 'BIRTH_DATE_MISSING',
          message: `${workDate}: 생년월일 미등록으로 미성년 여부를 판정할 수 없어 유연/선택 근로제 배정을 저장할 수 없습니다.`,
        });
        continue;
      }

      const isMinor = ageAsOf(employee.birthDate, new Date(`${workDate}T00:00:00.000Z`)) < 18;
      const protectedStatuses = await this.protectedStatusRepo.findActiveDecrypted(target.employeeId, {
        asOfDate: new Date(`${workDate}T00:00:00.000Z`),
      });
      const worker: WorkerProfile = { isMinor, isPregnant: protectedStatuses.some((s) => s.statusType === 'PREGNANCY') };
      const agreementInPlace = await this.agreementResolver.hasActiveFlexibleWorkAgreement(
        target.siteId,
        new Date(`${workDate}T00:00:00.000Z`),
        flexibleWorkType,
      );

      try {
        assertFlexibleWorkEligible(worker, agreementInPlace);
      } catch (e) {
        if (e instanceof FlexibleWorkNotEligibleError || e instanceof FlexibleWorkAgreementMissingError) {
          hardBlocks.push({ scheduleId: target.id, code: e.name, message: `${workDate}: ${e.message}` });
        } else if (e instanceof CoreRulesError) {
          hardBlocks.push({ scheduleId: target.id, code: e.name, message: `${workDate}: ${e.message}` });
        } else {
          throw e;
        }
      }
    }

    if (options.skipSoftWarnings) return { hardBlocks, softWarnings };

    // --- Soft warning: 휴게 미부여(행 단위) ---
    const policyBySite = new Map<string, SchedulePolicy>();
    for (const target of targets) {
      if (!policyBySite.has(target.siteId)) {
        policyBySite.set(target.siteId, await this.policyResolver.resolve(target.siteId, target.plannedStartAt));
      }
      const policy = policyBySite.get(target.siteId)!;
      const plannedWorkMinutes = Math.max(
        0,
        Math.floor((target.plannedEndAt.getTime() - target.plannedStartAt.getTime()) / 60000) - target.plannedBreakMinutes,
      );
      const breakCheck = checkPlannedBreakSufficiency({ plannedWorkMinutes, plannedBreakMinutes: target.plannedBreakMinutes, policy });
      if (!breakCheck.sufficient) {
        softWarnings.push({
          scheduleId: target.id,
          code: 'BREAK_INSUFFICIENT',
          message: `${deriveWorkDateString(target.plannedStartAt)}: 휴게가 ${breakCheck.shortfallMinutes}분 부족합니다(필요 ${breakCheck.requiredMinutes}분).`,
        });
      }
    }

    // --- Soft warning: 직원 단위 주간 상한/연속근무/연속휴식 ---
    const byEmployee = new Map<string, ScheduleValidationTarget[]>();
    for (const t of targets) {
      if (!byEmployee.has(t.employeeId)) byEmployee.set(t.employeeId, []);
      byEmployee.get(t.employeeId)!.push(t);
    }

    for (const [employeeId, empTargets] of byEmployee) {
      const dates = empTargets.map((t) => deriveWorkDateString(t.plannedStartAt)).sort();
      const from = dates[0];
      const to = dates[dates.length - 1];
      const window = await this.aggregation.fetchEmployeeWindow(employeeId, from, to);
      const policy = policyBySite.get(empTargets[0].siteId) ?? (await this.policyResolver.resolve(empTargets[0].siteId, empTargets[0].plannedStartAt));

      const workDates = this.aggregation.buildWorkDates(window);
      const workdayCheck = checkConsecutiveWorkdayLimit({ workDates, maxConsecutiveDays: policy.consecutiveWorkdayLimitDays });
      if (workdayCheck.violated) {
        for (const reason of workdayCheck.reasons) softWarnings.push({ code: 'CONSECUTIVE_WORKDAY_LIMIT', message: reason });
      }

      const restGaps = this.aggregation.buildRestGaps(window);
      const restCheck = checkConsecutiveRestBetweenShifts(restGaps, policy.continuousRestMinutes);
      if (restCheck.violated) {
        for (const reason of restCheck.reasons) softWarnings.push({ code: 'CONSECUTIVE_REST_SHORTFALL', message: reason });
      }

      const windowTemplateIds = [...new Set(window.map((w) => w.shiftTemplateId).filter((id): id is string => Boolean(id)))];
      const windowTemplates = await this.prisma.shiftTemplate.findMany({ where: { id: { in: windowTemplateIds } } });
      const windowTemplateById = new Map(windowTemplates.map((t) => [t.id, t]));

      const byWeek = new Map<string, Schedule[]>();
      for (const row of window) {
        const week = mondayOfWeek(deriveWorkDateString(row.plannedStartAt));
        if (!byWeek.has(week)) byWeek.set(week, []);
        byWeek.get(week)!.push(row);
      }

      const birthDate = (await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { birthDate: true } }))?.birthDate ?? null;

      for (const [weekStart, weekRows] of byWeek) {
        const flexTypes = new Set(
          weekRows.map((r) => (r.shiftTemplateId ? windowTemplateById.get(r.shiftTemplateId)?.flexibleWorkType : null)).filter(Boolean),
        );
        const dailyTotals = this.aggregation.buildDailyTotals(weekRows);
        const weeklyTotals = this.aggregation.buildWeeklyTotals(weekRows);

        if (flexTypes.size === 0) {
          const check = checkWeeklyLimitViolation({
            dailyTotals: dailyTotals.map((d) => ({ date: d.date, totalWorkMinutes: d.totalMinutes })),
            policy,
          });
          if (check.violated) {
            softWarnings.push({
              code: 'WEEKLY_LIMIT_PROJECTED',
              message: `${weekStart} 주 계획 근로시간이 52시간 상한을 초과할 것으로 예상됩니다(40h 초과분 ${check.excessOver40Minutes}분).`,
            });
          }
          continue;
        }

        if (flexTypes.size > 1) {
          softWarnings.push({ code: 'MIXED_FLEXIBLE_WORK_TYPE', message: `${weekStart} 주에 서로 다른 유연근로 유형이 섞여 있어 상한 검증을 건너뜁니다.` });
          continue;
        }

        const flexType = [...flexTypes][0] as string;
        const isMinor = birthDate ? ageAsOf(birthDate, dateOnly(weekStart)) < 18 : true;
        const protectedStatuses = await this.protectedStatusRepo.findActiveDecrypted(employeeId, { asOfDate: dateOnly(weekStart) });
        const worker: WorkerProfile = { isMinor, isPregnant: protectedStatuses.some((s) => s.statusType === 'PREGNANCY') };
        const agreementInPlace = await this.agreementResolver.hasActiveFlexibleWorkAgreement(empTargets[0].siteId, dateOnly(weekStart), flexType);

        try {
          if (flexType === 'FLEXIBLE_BIWEEKLY') {
            const check = checkBiweeklyFlexibleWork({ worker, agreementInPlace, weeklyTotals, policy });
            if (check.violated) for (const r of check.reasons) softWarnings.push({ code: 'FLEXIBLE_CAP_EXCEEDED', message: `${weekStart} 주: ${r}` });
          } else if (flexType === 'FLEXIBLE_QUARTERLY') {
            const check = checkQuarterlyFlexibleWork({ worker, agreementInPlace, weeklyTotals, dailyTotals, policy });
            if (check.violated) for (const r of check.reasons) softWarnings.push({ code: 'FLEXIBLE_CAP_EXCEEDED', message: `${weekStart} 주: ${r}` });
          } else if (flexType === 'FLEXIBLE_SEMIANNUAL') {
            const weekRestGaps = restGaps.filter((g) => g.afterWorkDate >= weekStart && g.afterWorkDate < addDays(weekStart, 7));
            const check = checkSemiannualFlexibleWork({
              worker,
              agreementInPlace,
              weeklyTotals,
              dailyTotals,
              restGapsMinutes: weekRestGaps.map((g) => g.gapMinutes),
              noticeGivenAt: noticeGivenAt.toISOString(),
              arrangementStartAt: weekRows[0].plannedStartAt.toISOString(),
              policy,
            });
            if (check.violated) for (const r of check.reasons) softWarnings.push({ code: 'FLEXIBLE_CAP_EXCEEDED', message: `${weekStart} 주: ${r}` });
          }
          // SELECTIVE_MONTHLY는 월 단위 초과정산 개념이라(주 단위 상한이 없음)
          // 이 주간 루프에서는 검증하지 않는다 — 별도 월간 정산 리포트(요구사항6)의 몫.
        } catch (e) {
          if (e instanceof CoreRulesError) {
            softWarnings.push({ code: 'FLEXIBLE_ELIGIBILITY', message: `${weekStart} 주: ${e.message}` });
          } else {
            throw e;
          }
        }
      }
    }

    return { hardBlocks, softWarnings };
  }
}

