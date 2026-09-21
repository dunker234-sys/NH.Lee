import { Injectable } from '@nestjs/common';
import { EmployeeSiteAssignment, Site } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export type EmployeeSiteAssignmentWithSite = EmployeeSiteAssignment & { site: Site };

/** site/employee_site_assignment에 대한 이 모듈의 유일한 접근 지점(읽기 전용). */
@Injectable()
export class SitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveAssignmentsForEmployee(employeeId: string, asOfDate: Date): Promise<EmployeeSiteAssignmentWithSite[]> {
    return this.prisma.employeeSiteAssignment.findMany({
      where: {
        employeeId,
        startDate: { lte: asOfDate },
        OR: [{ endDate: null }, { endDate: { gte: asOfDate } }],
      },
      include: { site: true },
      orderBy: { assignmentRole: 'asc' },
    });
  }

  async findById(siteId: string): Promise<Site | null> {
    return this.prisma.site.findUnique({ where: { id: siteId } });
  }
}
