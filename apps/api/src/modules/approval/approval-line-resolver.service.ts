import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ApprovalLineApprover {
  employeeId: string;
}

/**
 * 결재선 자동 구성 — 사업장 SITE_MANAGER → 없으면 REGIONAL → 없으면 HQ_HR로
 * 에스컬레이션하고, 각 단계에서 활성 Delegation이 있으면 대체/추가한다.
 *
 * ★ 인가 게이트가 아니라 알림 라우팅 전용이다 — 기존 @Roles()+OrgScope
 * 모델이 이미 "그 사업장을 관할하는 관리자라면 누구나 승인 가능"을
 * 보장하므로, 이 리졸버에 버그가 있어도 정당한 관리자의 승인 자체를
 * 막지 않는다(STEP6.5 계획 §Context 근거).
 */
@Injectable()
export class ApprovalLineResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveApprovers(siteId: string, asOfDate: Date): Promise<ApprovalLineApprover[]> {
    const base = await this.resolveBaseApprovers(siteId, asOfDate);
    const expanded = await this.applyDelegations(base, siteId, asOfDate);
    return [...new Set(expanded)].map((employeeId) => ({ employeeId }));
  }

  private async resolveBaseApprovers(siteId: string, asOfDate: Date): Promise<string[]> {
    const siteManagers = await this.activeEmployeesForRole('SITE_MANAGER', [siteId], asOfDate);
    if (siteManagers.length > 0) return siteManagers;

    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { regionId: true } });
    if (site) {
      const regionSites = await this.prisma.site.findMany({
        where: { regionId: site.regionId },
        select: { id: true },
      });
      const regional = await this.activeEmployeesForRole(
        'REGIONAL',
        regionSites.map((s) => s.id),
        asOfDate,
      );
      if (regional.length > 0) return regional;
    }

    const hqHr = await this.prisma.employee.findMany({
      where: { role: 'HQ_HR', status: 'ACTIVE' },
      select: { id: true },
    });
    return hqHr.map((e) => e.id);
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

  private async applyDelegations(baseApproverIds: string[], siteId: string, asOfDate: Date): Promise<string[]> {
    if (baseApproverIds.length === 0) return baseApproverIds;

    const delegations = await this.prisma.delegation.findMany({
      where: {
        delegatorId: { in: baseApproverIds },
        status: 'ACTIVE',
        effectiveStartDate: { lte: asOfDate },
        OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }],
        AND: [{ OR: [{ siteId: null }, { siteId }] }],
      },
      select: { delegatorId: true, delegateId: true },
    });

    if (delegations.length === 0) return baseApproverIds;

    const delegatedAway = new Set(delegations.map((d) => d.delegatorId));
    const result = baseApproverIds.filter((id) => !delegatedAway.has(id));
    for (const d of delegations) result.push(d.delegateId);
    return result;
  }
}
