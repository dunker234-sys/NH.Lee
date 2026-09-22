import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentRole, EmploymentType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { createTempPasswordHash } from '../../../common/auth/temp-credential.util';
import { EmployeePrincipal } from '../../../common/principal/principal.types';
import { EmployeeWageRateService } from '../../payroll-close/employee-wage-rate.service';

const TEMP_PASSWORD_BCRYPT_ROUNDS = 10;

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

export interface RegisterPartnerAdminInput {
  employeeNo: string;
  name: string;
  primarySiteId: string;
}

export interface ResignPartnerEmployeeInput {
  resignationDate: string;
}

export interface PartnerLaborCostRow {
  employeeId: string;
  employeeNo: string;
  name: string;
  wageType: string | null;
  baseAmount: number | null;
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
    private readonly wageRateService: EmployeeWageRateService,
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

  /**
   * 협력업체 관리자 등록(수정사항). 스키마에는 있지만 한 번도 배정된 적 없던
   * PARTNER 역할을 실제로 쓴다 — 로그인 후 GET /me/partner/employees로 자기
   * 회사 소속 파견 인력을 조회할 수 있다. registerEmployee()와 달리 로그인이
   * 목적이라 임시 비밀번호 평문을 이 응답에서 한 번만 노출한다(kiosk-devices
   * 페어링 발급과 동일 원칙 — createTempPasswordHash()는 평문을 버리므로
   * 이 흐름에는 쓸 수 없다).
   */
  async registerAdmin(companyId: string, principal: EmployeePrincipal, input: RegisterPartnerAdminInput): Promise<{ id: string; employeeNo: string; tempPassword: string }> {
    const company = await this.prisma.partnerCompany.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException({ code: 'PARTNER_COMPANY_NOT_FOUND' });

    const existing = await this.prisma.employee.findUnique({ where: { employeeNo: input.employeeNo } });
    if (existing) throw new BadRequestException({ code: 'EMPLOYEE_NO_ALREADY_EXISTS' });

    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, TEMP_PASSWORD_BCRYPT_ROUNDS);
    const hireDate = new Date();

    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          employeeNo: input.employeeNo,
          name: input.name,
          role: 'PARTNER',
          employmentType: EmploymentType.DISPATCHED,
          hireDate,
          primarySiteId: input.primarySiteId,
          partnerCompanyId: companyId,
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
      eventType: 'PARTNER_ADMIN_REGISTERED',
      resourceType: 'Employee',
      resourceId: employee.id,
      afterValue: { companyId, employeeNo: input.employeeNo },
    });

    return { id: employee.id, employeeNo: employee.employeeNo, tempPassword };
  }

  /** 파견직 퇴사자 등록(수정사항) — hr-sync-apply.service.ts의 자동 동기화
   * DEPARTED 처리와 동일한 상태 전환을 수동 경로로 제공한다. */
  async resignEmployee(companyId: string, employeeId: string, principal: EmployeePrincipal, input: ResignPartnerEmployeeInput) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND' });
    if (employee.partnerCompanyId !== companyId) {
      throw new BadRequestException({ code: 'EMPLOYEE_NOT_IN_PARTNER_COMPANY', message: '해당 협력업체 소속 직원이 아닙니다.' });
    }

    const resignationDate = new Date(`${input.resignationDate}T00:00:00.000Z`);
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { status: 'RESIGNED', resignationDate },
    });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'PARTNER_EMPLOYEE_RESIGNED',
      resourceType: 'Employee',
      resourceId: employeeId,
      afterValue: { companyId, resignationDate: input.resignationDate },
    });

    return { id: updated.id, employeeNo: updated.employeeNo, status: updated.status, resignationDate: input.resignationDate };
  }

  /** 파견직 인건비 확인(수정사항) — 실제 지급액이 아니라 현재 등록된 요율
   * 기준이다(EmployeeWageRateService.currentRate 재사용, payroll-statement
   * 계산 로직을 새로 복제하지 않는다). */
  async laborCost(companyId: string, asOfDate: string): Promise<PartnerLaborCostRow[]> {
    const company = await this.prisma.partnerCompany.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException({ code: 'PARTNER_COMPANY_NOT_FOUND' });

    const employees = await this.prisma.employee.findMany({
      where: { partnerCompanyId: companyId, status: { not: 'RESIGNED' } },
      orderBy: { employeeNo: 'asc' },
    });
    const asOfDateObj = new Date(`${asOfDate}T00:00:00.000Z`);

    const rows: PartnerLaborCostRow[] = [];
    for (const employee of employees) {
      const rate = await this.wageRateService.currentRate(employee.id, asOfDateObj);
      rows.push({
        employeeId: employee.id,
        employeeNo: employee.employeeNo,
        name: employee.name,
        wageType: rate?.wageType ?? null,
        baseAmount: rate ? rate.baseAmount.toNumber() : null,
      });
    }
    return rows;
  }
}
