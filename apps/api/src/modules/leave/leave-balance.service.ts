import { Injectable } from '@nestjs/common';
import { LeaveBalance, LeaveRequest } from '@prisma/client';
import { leaveUnitDayFraction } from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/time/week.util';
import { LeaveInsufficientBalanceError } from './errors/leave-errors';

/**
 * LeaveBalance.usedDays를 만지는 유일한 경로. deduct/restore 둘 다
 * LeaveRequest.leaveBalanceId(승인 시점에 확정 저장된 대상 행)를 그대로
 * 쓴다 — 정책이 나중에 바뀌어도 재계산하지 않고 그 값 그대로 되돌린다.
 */
@Injectable()
export class LeaveBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** 신청 시점 사용 가능한 LeaveBalance 행을 찾는다(신청 기간이 속한
   * referencePeriod). 여러 개면 만료일이 가장 이른 것부터 쓴다(선입선출). */
  async findUsableBalance(employeeId: string, leaveTypeId: string, startDate: string): Promise<LeaveBalance | null> {
    const startDateObj = dateOnly(startDate);
    const balances = await this.prisma.leaveBalance.findMany({
      where: { employeeId, leaveTypeId, effectiveDate: { lte: startDateObj }, expiryDate: { gte: startDateObj } },
      orderBy: { expiryDate: 'asc' },
    });
    for (const balance of balances) {
      const remaining = balance.grantedDays.plus(balance.carriedOverDays).minus(balance.usedDays);
      if (remaining.gt(0)) return balance;
    }
    return balances[0] ?? null;
  }

  async deduct(leaveBalanceId: string, days: number): Promise<LeaveBalance> {
    const balance = await this.prisma.leaveBalance.findUniqueOrThrow({ where: { id: leaveBalanceId } });
    const remaining = balance.grantedDays.plus(balance.carriedOverDays).minus(balance.usedDays);
    if (remaining.lt(days)) {
      throw new LeaveInsufficientBalanceError(remaining.toNumber(), days);
    }
    return this.prisma.leaveBalance.update({
      where: { id: leaveBalanceId },
      data: { usedDays: { increment: days } },
    });
  }

  async restore(leaveRequest: LeaveRequest): Promise<void> {
    if (!leaveRequest.leaveBalanceId || leaveRequest.deductedDays.lte(0)) return;
    await this.prisma.leaveBalance.update({
      where: { id: leaveRequest.leaveBalanceId },
      data: { usedDays: { decrement: leaveRequest.deductedDays } },
    });
  }

  dayFractionFor(unit: string, startDate: string, endDate: string): number {
    const days = Math.floor((dateOnly(endDate).getTime() - dateOnly(startDate).getTime()) / 86_400_000) + 1;
    // FULL 단위는 신청 기간 전체 일수, 반차/반반차는 하루짜리 신청 전제(스키마상
    // 여러 날에 걸친 반차 신청은 지원하지 않는다 — 요구사항 범위 밖).
    return unit === 'FULL' ? days : leaveUnitDayFraction(unit as never);
  }
}
