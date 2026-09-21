import { Injectable } from '@nestjs/common';
import { LeaveBalance } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class LeaveBalanceMeService {
  constructor(private readonly prisma: PrismaService) {}

  /** 본인 잔액 조회 — basis(산출 근거)를 그대로 반환한다(요구사항서4.3 §4). */
  list(employeeId: string, year?: string): Promise<LeaveBalance[]> {
    return this.prisma.leaveBalance.findMany({
      where: { employeeId, referencePeriod: year ? { startsWith: year } : undefined },
      include: { leaveType: true },
      orderBy: { effectiveDate: 'desc' },
    });
  }
}
