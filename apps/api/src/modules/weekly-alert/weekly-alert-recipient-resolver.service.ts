import { Injectable } from '@nestjs/common';
import { WeeklyAlertStage } from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';

const STAGE_RANK: Record<WeeklyAlertStage, number> = { NONE: 0, ATTENTION: 1, WARNING: 2, DANGER: 3, EXCEEDED: 4 };

/**
 * 요구사항서 4.4② 알림 수신자 에스컬레이션 — 단계가 오를수록 이전 단계
 * 수신자에 "추가"된다(주의: 근로자 / 경고: +사업장관리자 / 위험: +권역 /
 * 초과: +본사HR). ApprovalLineResolverService(결재선)는 "그 사업장을 관할하는
 * 관리자 1단계로 에스컬레이션"(있으면 그걸로 끝, 없으면 다음 단계)이라
 * 의미가 달라 재사용하지 않는다 — 여기서는 누적이 핵심이다.
 */
@Injectable()
export class WeeklyAlertRecipientResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /** 근로자 본인은 포함하지 않는다 — 호출자가 항상 별도로 알린다. */
  async resolveEscalationRecipients(siteId: string, stage: WeeklyAlertStage, asOfDate: Date): Promise<string[]> {
    const rank = STAGE_RANK[stage];
    const recipientIds = new Set<string>();

    if (rank >= STAGE_RANK.WARNING) {
      for (const id of await this.activeEmployeesForRole('SITE_MANAGER', [siteId], asOfDate)) recipientIds.add(id);
    }
    if (rank >= STAGE_RANK.DANGER) {
      const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { regionId: true } });
      if (site) {
        const regionSites = await this.prisma.site.findMany({ where: { regionId: site.regionId }, select: { id: true } });
        for (const id of await this.activeEmployeesForRole('REGIONAL', regionSites.map((s) => s.id), asOfDate)) {
          recipientIds.add(id);
        }
      }
    }
    if (rank >= STAGE_RANK.EXCEEDED) {
      const hqHr = await this.prisma.employee.findMany({ where: { role: 'HQ_HR', status: 'ACTIVE' }, select: { id: true } });
      for (const e of hqHr) recipientIds.add(e.id);
    }

    return [...recipientIds];
  }

  private async activeEmployeesForRole(
    role: 'SITE_MANAGER' | 'REGIONAL',
    siteIds: string[],
    asOfDate: Date,
  ): Promise<string[]> {
    const employees = await this.prisma.employee.findMany({
      where: {
        role,
        status: 'ACTIVE',
        siteAssignments: {
          some: { siteId: { in: siteIds }, startDate: { lte: asOfDate }, OR: [{ endDate: null }, { endDate: { gte: asOfDate } }] },
        },
      },
      select: { id: true },
    });
    return employees.map((e) => e.id);
  }
}
