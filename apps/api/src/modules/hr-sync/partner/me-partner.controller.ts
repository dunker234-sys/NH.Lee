import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../../common/principal/principal.types';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * 협력사 담당자 셀프서비스 — "협력사 담당자는 자사 인력만 조회"(요구사항서
 * 5장④). org-scope(사업장 축)를 확장하지 않고, 호출자의 partnerCompanyId로만
 * 필터하는 별도의 좁은 경로다(leave-balance-me.controller.ts와 동일 원칙 —
 * blast radius 최소화를 위해 org-scope-resolver.service.ts는 건드리지 않는다).
 */
@ApiTags('hr-sync')
@Controller('me/partner')
export class MePartnerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('employees')
  async listMyPartnerEmployees(@CurrentPrincipal() principal: EmployeePrincipal) {
    const self = await this.prisma.employee.findUniqueOrThrow({ where: { id: principal.employeeId }, select: { partnerCompanyId: true } });
    if (!self.partnerCompanyId) {
      throw new ForbiddenException({ code: 'NOT_A_PARTNER_CONTACT', message: '협력사 소속이 아닙니다.' });
    }
    return this.prisma.employee.findMany({
      where: { partnerCompanyId: self.partnerCompanyId, id: { not: principal.employeeId } },
      orderBy: { employeeNo: 'asc' },
    });
  }
}
