import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentRole, EmploymentType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { createTempPasswordHash } from '../../../common/auth/temp-credential.util';
import { EmployeePrincipal } from '../../../common/principal/principal.types';

export interface CreatePartnerCompanyInput {
  code: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
}

export interface RegisterPartnerEmployeeInput {
  employeeNo: string;
  name: string;
  primarySiteId: string;
  hireDate: string;
  jobTitle?: string;
  department?: string;
  employmentType?: EmploymentType;
}

/**
 * 인사시스템에 없는 파견·협력업체 인력 관리(요구사항서 5장④). 협력사
 * 코드로 구분하고, 협력사 소속 직원은 partnerCompanyId로 표시한다.
 * 겸직/복수사업장 로직(EmployeeSiteAssignment)은 건드리지 않는다 — PRIMARY
 * 배정 1건만 만든다.
 */
@Injectable()
export class PartnerCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.partnerCompany.findMany({ orderBy: { code: 'asc' } });
  }

  create(input: CreatePartnerCompanyInput) {
    return this.prisma.partnerCompany.create({ data: input });
  }

  async deactivate(id: string) {
    const company = await this.prisma.partnerCompany.findUnique({ where: { id } });
    if (!company) throw new NotFoundException({ code: 'PARTNER_COMPANY_NOT_FOUND' });
    return this.prisma.partnerCompany.update({ where: { id }, data: { active: false } });
  }

  async registerEmployee(companyId: string, principal: EmployeePrincipal, input: RegisterPartnerEmployeeInput) {
    const company = await this.prisma.partnerCompany.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException({ code: 'PARTNER_COMPANY_NOT_FOUND' });

    const existing = await this.prisma.employee.findUnique({ where: { employeeNo: input.employeeNo } });
    if (existing) throw new BadRequestException({ code: 'EMPLOYEE_NO_ALREADY_EXISTS' });

    const passwordHash = await createTempPasswordHash();
    const hireDate = new Date(`${input.hireDate}T00:00:00.000Z`);

    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          employeeNo: input.employeeNo,
          name: input.name,
          employmentType: input.employmentType ?? EmploymentType.DISPATCHED,
          hireDate,
          primarySiteId: input.primarySiteId,
          partnerCompanyId: companyId,
          jobTitle: input.jobTitle,
          department: input.department,
          credential: { create: { passwordHash } },
        },
      });
      await tx.employeeSiteAssignment.create({
        data: { employeeId: created.id, siteId: input.primarySiteId, assignmentRole: AssignmentRole.PRIMARY, startDate: hireDate },
      });
      return created;
    });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'PARTNER_EMPLOYEE_REGISTERED',
      resourceType: 'Employee',
      resourceId: employee.id,
      afterValue: { companyId, employeeNo: input.employeeNo },
    });

    return { id: employee.id, employeeNo: employee.employeeNo };
  }
}
