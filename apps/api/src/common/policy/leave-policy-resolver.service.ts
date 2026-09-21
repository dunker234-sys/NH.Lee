import { Injectable } from '@nestjs/common';
import { AnnualLeavePolicyConfig, LeavePromotionPolicyConfig } from '@attendance/core-rules';
import { PrismaService } from '../prisma/prisma.service';

export interface LeavePolicy extends AnnualLeavePolicyConfig, LeavePromotionPolicyConfig {}

const REQUIRED_KEYS: (keyof LeavePolicy)[] = [
  'annualLeaveBaseDays',
  'annualLeaveMaxCapDays',
  'annualLeaveSeniorityIntervalYears',
  'annualLeaveMonthlyAccrualMaxMonths',
  'annualLeaveAttendanceRateThresholdPercent',
  'ultraPartTimeWeeklyThresholdMinutes',
  'article611FirstNoticeWindowDays',
  'article611FirstNoticeAnchorMonthsBeforeExpiry',
  'article611EmployeeResponseWindowDays',
  'article611SecondNoticeDeadlineMonthsBeforeExpiry',
  'article612WaveAFirstNoticeWindowDays',
  'article612WaveAFirstNoticeAnchorMonthsBefore',
  'article612WaveASecondNoticeDeadlineMonthsBefore',
  'article612WaveBFirstNoticeWindowDays',
  'article612WaveBFirstNoticeAnchorMonthsBefore',
  'article612WaveBSecondNoticeDeadlineDaysBefore',
];

/**
 * STEP7 연차 발생(§60)/촉진(§61) 정책값 조립. schedule-policy-resolver.service.ts
 * 와 동일한 패턴 — N개 키를 site+전사 값 전부 단일 쿼리로 가져와 메모리에서
 * 우선순위를 적용하고, 누락된 키는 임의 기본값으로 대체하지 않고 throw한다
 * (CLAUDE.md 절대 규칙4). ultraPartTimeWeeklyThresholdMinutes는
 * recalculation-policy-defaults.ts가 이미 시딩한 전사 공용 키를 그대로 재사용한다.
 */
@Injectable()
export class LeavePolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: Date): Promise<LeavePolicy> {
    const rows = await this.prisma.policyConfig.findMany({
      where: {
        key: { in: REQUIRED_KEYS },
        AND: [
          { OR: [{ siteId }, { siteId: null }] },
          { effectiveStartDate: { lte: asOfDate } },
          { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }] },
        ],
      },
      orderBy: { effectiveStartDate: 'desc' },
    });

    const bestValueByKey = new Map<string, unknown>();
    for (const row of rows) {
      if (row.siteId === siteId && !bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value);
    }
    for (const row of rows) {
      if (row.siteId === null && !bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value);
    }

    const result = {} as LeavePolicy;
    for (const key of REQUIRED_KEYS) {
      if (!bestValueByKey.has(key)) {
        throw new Error(
          `정책값 '${key}'를 policy_config에서 찾을 수 없습니다(사업장 ${siteId}, 기준일 ${asOfDate.toISOString()}). ` +
            `임의 기본값으로 대체하지 않습니다 — CLAUDE.md 절대 규칙 4.`,
        );
      }
      (result as unknown as Record<string, unknown>)[key] = bestValueByKey.get(key);
    }
    return result;
  }
}
