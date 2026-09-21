import { Injectable } from '@nestjs/common';
import { LeaveRequest } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/time/week.util';
import { RecalculationTriggerService } from '../recalculation/recalculation-trigger.service';
import { NotificationService } from '../notifications/notification.service';
import { ApprovalLineResolverService } from '../approval/approval-line-resolver.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveApplicationDeadlinePassedError, LeaveCancellationNotAllowedError, LeaveRequestNotFoundError } from './errors/leave-errors';
import { LeaveBalanceService } from './leave-balance.service';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class LeaveRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly approvalLine: ApprovalLineResolverService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly recalcTrigger: RecalculationTriggerService,
  ) {}

  async create(employeeId: string, dto: CreateLeaveRequestDto): Promise<LeaveRequest> {
    const [employee, leaveType] = await Promise.all([
      this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { name: true, primarySiteId: true } }),
      this.prisma.leaveType.findUniqueOrThrow({ where: { id: dto.leaveTypeId } }),
    ]);

    if (leaveType.applicationDeadlineDaysBeforeUse != null) {
      const deadline = new Date(dateOnly(dto.startDate).getTime() - leaveType.applicationDeadlineDaysBeforeUse * 86_400_000)
        .toISOString()
        .slice(0, 10);
      if (todayString() > deadline) {
        throw new LeaveApplicationDeadlinePassedError(leaveType.applicationDeadlineDaysBeforeUse);
      }
    }

    const created = await this.prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: dto.leaveTypeId,
        startDate: dateOnly(dto.startDate),
        endDate: dateOnly(dto.endDate),
        unit: dto.unit ?? 'FULL',
        reason: dto.reason,
      },
    });

    const approvers = await this.approvalLine.resolveApprovers(employee.primarySiteId, dateOnly(dto.startDate));
    for (const approver of approvers) {
      await this.notificationService.notify('LEAVE_REQUEST_SUBMITTED', approver.employeeId, {
        employeeName: employee.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
      });
    }

    return created;
  }

  list(employeeId: string): Promise<LeaveRequest[]> {
    return this.prisma.leaveRequest.findMany({ where: { employeeId }, orderBy: { startDate: 'desc' } });
  }

  async cancel(employeeId: string, id: string): Promise<LeaveRequest> {
    const row = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!row || row.employeeId !== employeeId) throw new LeaveRequestNotFoundError(id);

    if (row.status === 'PENDING') {
      const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.notificationService.notify('LEAVE_CANCELLATION_APPROVED', employeeId, {
        startDate: row.startDate.toISOString().slice(0, 10),
      });
      return updated;
    }

    if (row.status === 'APPROVED') {
      const startDateStr = row.startDate.toISOString().slice(0, 10);
      const endDateStr = row.endDate.toISOString().slice(0, 10);

      if (todayString() < startDateStr) {
        // 사용 예정일 이전 — 자동 복원(요구사항서4.3 §6).
        const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
        await this.leaveBalanceService.restore(row);
        await this.recalcTrigger.onLeaveApproved(employeeId, startDateStr, endDateStr);
        await this.notificationService.notify('LEAVE_CANCELLATION_APPROVED', employeeId, { startDate: startDateStr });
        return updated;
      }

      // 사용 개시 이후 — 사후 취소는 관리자 승인 필요(잔액 미변경).
      const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCEL_PENDING' } });
      const employee = await this.prisma.employee.findUniqueOrThrow({
        where: { id: employeeId },
        select: { name: true, primarySiteId: true },
      });
      const approvers = await this.approvalLine.resolveApprovers(employee.primarySiteId, dateOnly(startDateStr));
      for (const approver of approvers) {
        await this.notificationService.notify('LEAVE_CANCELLATION_REQUESTED', approver.employeeId, {
          employeeName: employee.name,
          startDate: startDateStr,
        });
      }
      return updated;
    }

    throw new LeaveCancellationNotAllowedError(row.status);
  }
}
