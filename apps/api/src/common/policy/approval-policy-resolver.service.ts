import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ApprovalPolicy {
  /** 스케줄 시작보다 이 값(분) 이상 이르면 "조기 출근"으로 센다. */
  earlyClockInMinutesThreshold: number;
  /** 월 단위로 이 값 이상 조기 출근이 반복되면 EarlyClockInPatternFlag를 만든다. */
  earlyClockInMonthlyOccurrenceThreshold: number;
}

const REQUIRED_KEYS: (keyof ApprovalPolicy)[] = [
  'earlyClockInMinutesThreshold',
  'earlyClockInMonthlyOccurrenceThreshold',
];

/**
 * STEP6.5 조기출근 반복 패턴 탐지가 필요로 하는 정책값 조립.
 * SchedulePolicyResolverService/PunchPolicyResolverService와 동일한 패턴 —
 * N개 키를 site+전사 값 전부 단일 쿼리로 가져와 메모리에서 우선순위를
 * 적용하고, 누락된 키는 임의 기본값으로 대체하지 않고 throw한다
 * (CLAUDE.md 절대 규칙 4).
 */
@Injectable()
export class ApprovalPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: Date): Promise<ApprovalPolicy> {
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

    const result = {} as ApprovalPolicy;
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
