import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type LeaveAccrualBasis = 'ANNIVERSARY' | 'FISCAL_YEAR';

const KEY = 'annualLeaveAccrualBasis';

/**
 * 연차 산정 기준(입사일 vs 회계연도) — 문자열 policy_config 값이라
 * LeavePolicyResolverService의 숫자 전용 배치 조회 경로를 오염시키지
 * 않도록 별도 리졸버로 분리했다. 조회 패턴 자체는 동일(site 우선,
 * 전사 기본값 폴백, 누락 시 throw).
 */
@Injectable()
export class LeaveAccrualBasisResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string, asOfDate: Date): Promise<LeaveAccrualBasis> {
    const rows = await this.prisma.policyConfig.findMany({
      where: {
        key: KEY,
        AND: [
          { OR: [{ siteId }, { siteId: null }] },
          { effectiveStartDate: { lte: asOfDate } },
          { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }] },
        ],
      },
      orderBy: { effectiveStartDate: 'desc' },
    });

    const siteRow = rows.find((r) => r.siteId === siteId);
    const orgRow = rows.find((r) => r.siteId === null);
    const value = (siteRow ?? orgRow)?.value;

    if (value !== 'ANNIVERSARY' && value !== 'FISCAL_YEAR') {
      throw new Error(
        `정책값 '${KEY}'를 policy_config에서 찾을 수 없습니다(사업장 ${siteId}, 기준일 ${asOfDate.toISOString()}). ` +
          `임의 기본값으로 대체하지 않습니다 — CLAUDE.md 절대 규칙 4.`,
      );
    }
    return value;
  }
}
