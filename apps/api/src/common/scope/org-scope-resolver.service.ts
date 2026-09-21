import { Injectable } from '@nestjs/common';
import { EmployeeRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { allScope, OrgScope, sitesScope } from './org-scope.types';

/**
 * 역할 → 조직 스코프 매핑의 유일한 소스는 EmployeeSiteAssignment다.
 * Employee.primarySiteId는 표시용 비정규화 컬럼일 뿐이라 스코프 계산에 섞지
 * 않는다 — 두 값이 어긋나면(예: 인사이동 후 primarySiteId 갱신 누락) 스코프가
 * 실제보다 넓게 새는 사고로 이어진다.
 */
@Injectable()
export class OrgScopeResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(employeeId: string, role: EmployeeRole): Promise<OrgScope> {
    if (role === 'ADMIN' || role === 'HQ_HR') {
      return allScope();
    }

    if (role === 'REGIONAL') {
      const assignments = await this.activeAssignments(employeeId);
      if (assignments.length === 0) return sitesScope([]);

      const assignedSites = await this.prisma.site.findMany({
        where: { id: { in: assignments.map((a) => a.siteId) } },
        select: { regionId: true },
      });
      const regionIds = [...new Set(assignedSites.map((s) => s.regionId))];
      if (regionIds.length === 0) return sitesScope([]);

      const regionSites = await this.prisma.site.findMany({
        where: { regionId: { in: regionIds } },
        select: { id: true },
      });
      return sitesScope(regionSites.map((s) => s.id));
    }

    // SITE_MANAGER / EMPLOYEE / PARTNER — 오늘(KST) 기준 유효한 배정만 스코프로 인정한다.
    const assignments = await this.activeAssignments(employeeId);
    return sitesScope(assignments.map((a) => a.siteId));
  }

  private async activeAssignments(employeeId: string) {
    const today = kstTodayAsDate();
    return this.prisma.employeeSiteAssignment.findMany({
      where: {
        employeeId,
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      select: { siteId: true },
    });
  }
}

/**
 * KST(UTC+9) 기준 "오늘" 날짜를 계산한다. 서버 로컬 타임존에 의존하지 않고
 * 명시적으로 KST로 환산한다 — work_date 산출과 같은 원칙(CLAUDE.md 절대 규칙 5).
 */
function kstTodayAsDate(): Date {
  const now = new Date();
  const kstMillis = now.getTime() + 9 * 60 * 60 * 1000;
  const isoDate = new Date(kstMillis).toISOString().slice(0, 10);
  return new Date(`${isoDate}T00:00:00.000Z`);
}
