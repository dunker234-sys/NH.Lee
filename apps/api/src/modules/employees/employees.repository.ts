import { Injectable, NotFoundException } from '@nestjs/common';
import { Employee } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';

/**
 * 가드 증명용 최소 리소스. 조직 스코프 이중 필터를 실제 데이터로 검증하기
 * 위한 것이며, STEP 2 시점에는 이 목록 API 자체가 최종 제품 기능은 아니다.
 */
@Injectable()
export class EmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(scope: OrgScope, filter: { siteId?: string } = {}): Promise<Employee[]> {
    assertScope(scope);

    if (filter.siteId) {
      assertSiteInScope(scope, filter.siteId);
      return this.prisma.employee.findMany({
        where: { siteAssignments: { some: { siteId: filter.siteId } } },
        orderBy: { employeeNo: 'asc' },
      });
    }

    if (scope.kind === 'ALL') {
      return this.prisma.employee.findMany({ orderBy: { employeeNo: 'asc' } });
    }

    return this.prisma.employee.findMany({
      where: { siteAssignments: { some: { siteId: { in: scope.siteIds } } } },
      orderBy: { employeeNo: 'asc' },
    });
  }

  /**
   * STEP5-B: 키오스크 PIN 관리자 발급. 대상 직원이 호출자 스코프 안에
   * 있는지는 primarySiteId로 확인한다 — 목록(findMany)의 siteAssignments
   * 기반 필터와 달리 단건 조회라 가장 단순하고 명확한 기준을 쓴다.
   */
  async setPin(scope: OrgScope, employeeId: string, pinHash: string): Promise<void> {
    assertScope(scope);
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND' });
    assertSiteInScope(scope, employee.primarySiteId);

    await this.prisma.employeeCredential.update({
      where: { employeeId },
      data: { pinHash, pinSetAt: new Date(), pinFailedAttempts: 0, pinLockedUntil: null },
    });
  }

  /** STEP6: 임신 등 보호 상태 신고. HQ_HR만 호출 가능(컨트롤러 @Roles로 이미
   * 제한) — 여기서는 org-scope만 확인한다. */
  async setProtectedStatus(
    scope: OrgScope,
    employeeId: string,
    declaredBy: string,
    input: { statusType: string; effectiveStartDate: Date; effectiveEndDate?: Date },
  ): Promise<{ id: string }> {
    assertScope(scope);
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND' });
    assertSiteInScope(scope, employee.primarySiteId);

    const created = await this.prisma.employeeProtectedStatus.create({
      data: {
        employeeId,
        statusType: input.statusType,
        effectiveStartDate: input.effectiveStartDate,
        effectiveEndDate: input.effectiveEndDate,
        declaredBy,
      },
    });
    return { id: created.id };
  }
}
