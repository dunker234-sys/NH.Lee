import { Injectable } from '@nestjs/common';
import { WageType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 시급/월급 CRUD — 급여 정보라 쓰기는 HQ_HR/ADMIN만(컨트롤러에서 @Roles로
 * 강제, employee_protected_status와 동일한 권한 모델).
 */
@Injectable()
export class EmployeeWageRateService {
  constructor(private readonly prisma: PrismaService) {}

  async setRate(input: { employeeId: string; wageType: WageType; baseAmount: number; effectiveStartDate: string; createdBy: string }) {
    return this.prisma.employeeWageRate.create({
      data: {
        employeeId: input.employeeId,
        wageType: input.wageType,
        baseAmount: input.baseAmount,
        effectiveStartDate: new Date(`${input.effectiveStartDate}T00:00:00.000Z`),
        createdBy: input.createdBy,
      },
    });
  }

  async currentRate(employeeId: string, asOfDate: Date) {
    return this.prisma.employeeWageRate.findFirst({
      where: { employeeId, effectiveStartDate: { lte: asOfDate }, OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }] },
      orderBy: { effectiveStartDate: 'desc' },
    });
  }

  async history(employeeId: string) {
    return this.prisma.employeeWageRate.findMany({ where: { employeeId }, orderBy: { effectiveStartDate: 'desc' } });
  }
}
