import { Injectable } from '@nestjs/common';
import { PolicyConfig } from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RecalculationInputError } from './errors/recalculation-errors';
import { dateOnly } from '../../common/time/week.util';

/**
 * policy_config → core-rules PolicyConfig 조립. 이 서비스가 유일한 조립 지점이다
 * (CLAUDE.md 절대 규칙 4 — 법령 수치를 코드에 상수로 넣지 않는다). 값을 찾지
 * 못하면 임의 기본값으로 채우지 않고 즉시 예외를 던진다.
 *
 * key는 PolicyConfig 필드명과 1:1로 일치시킨다(예: "dailyStatutoryLimitMinutes").
 * 사업장별 오버라이드가 있으면 그것을 쓰고, 없으면 site_id=NULL(전사 기본값)을 쓴다.
 */
const REQUIRED_POLICY_KEYS: (keyof PolicyConfig)[] = [
  'dailyStatutoryLimitMinutes',
  'weeklyStatutoryLimitMinutes',
  'weeklyOvertimeCapMinutes',
  'nightStartMinuteOfDay',
  'nightEndMinuteOfDay',
  'overtimePremiumRate',
  'nightPremiumRate',
  'holidayPremiumRateWithin8h',
  'holidayPremiumRateExcess8h',
  'breakTierThresholdMinutes',
  'breakTierMinutes',
  'breakFullTierThresholdMinutes',
  'breakFullTierMinutes',
  'ultraPartTimeWeeklyThresholdMinutes',
  'annualLeaveMinContinuousMonths',
];

@Injectable()
export class PolicyConfigResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: string): Promise<PolicyConfig> {
    const values = await Promise.all(REQUIRED_POLICY_KEYS.map((key) => this.resolveOne(key, siteId, asOfDate)));
    const result = {} as PolicyConfig;
    REQUIRED_POLICY_KEYS.forEach((key, i) => {
      (result as unknown as Record<string, number>)[key] = values[i];
    });
    return result;
  }

  private async resolveOne(key: string, siteId: string, asOfDate: string): Promise<number> {
    const dObj = dateOnly(asOfDate);
    const activeAt = { effectiveStartDate: { lte: dObj }, OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: dObj } }] };

    const siteRow = await this.prisma.policyConfig.findFirst({
      where: { key, siteId, ...activeAt },
      orderBy: { effectiveStartDate: 'desc' },
    });
    const row =
      siteRow ??
      (await this.prisma.policyConfig.findFirst({
        where: { key, siteId: null, ...activeAt },
        orderBy: { effectiveStartDate: 'desc' },
      }));

    if (!row) {
      throw new RecalculationInputError(
        `정책값 '${key}'를 policy_config에서 찾을 수 없습니다(사업장 ${siteId}, 기준일 ${asOfDate}). ` +
          `임의 기본값으로 대체하지 않습니다 — CLAUDE.md 절대 규칙 4.`,
      );
    }
    return row.value as unknown as number;
  }
}
