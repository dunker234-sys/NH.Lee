import { Injectable } from '@nestjs/common';
import { LeaveRequest, LeaveRequestStatus } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { RecalculationTriggerService } from '../recalculation/recalculation-trigger.service';
import { NotificationService } from '../notifications/notification.service';
import { LeaveApproveDto } from './dto/leave-approve.dto';
import { LeaveRejectDto } from './dto/leave-reject.dto';
import { LeaveCancellationNotAllowedError, LeaveRequestNotFoundError, LeaveRequestVersionConflictError } from './errors/leave-errors';
import { LeaveBalanceService } from './leave-balance.service';

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class LeaveRequestApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly recalcTrigger: RecalculationTriggerService,
    private readonly leaveBalanceService: LeaveBalanceService,
  ) {}

  async list(scope: OrgScope, params: { siteId?: string; status?: LeaveRequestStatus }): Promise<LeaveRequest[]> {
    assertScope(scope);
    if (params.siteId) assertSiteInScope(scope, params.siteId);
    const siteIds = params.siteId ? [params.siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    return this.prisma.leaveRequest.findMany({
      where: {
        status: params.status,
        employee: siteIds ? { siteAssignments: { some: { siteId: { in: siteIds } } } } : undefined,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async approve(scope: OrgScope, principal: EmployeePrincipal, id: string, dto: LeaveApproveDto): Promise<LeaveRequest> {
    const row = await this.findWithScope(scope, id);
    const startDateStr = toDateString(row.startDate);
    const endDateStr = toDateString(row.endDate);

    const balance = await this.leaveBalanceService.findUsableBalance(row.employeeId, row.leaveTypeId, startDateStr);
    const deductedDays = this.leaveBalanceService.dayFractionFor(row.unit, startDateStr, endDateStr);
    if (balance) {
      await this.leaveBalanceService.deduct(balance.id, deductedDays);
    }

    const updated = await this.prisma.leaveRequest.updateMany({
      where: { id, version: dto.expectedVersion, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        approverId: principal.employeeId,
        leaveBalanceId: balance?.id,
        deductedDays,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) throw new LeaveRequestVersionConflictError(id, dto.expectedVersion);
    const final = await this.prisma.leaveRequest.findUniqueOrThrow({ where: { id } });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'LEAVE_REQUEST_APPROVED',
      resourceType: 'LeaveRequest',
      resourceId: id,
      beforeValue: { status: row.status },
      afterValue: { status: final.status, deductedDays: deductedDays.toString() },
    });
    await this.recalcTrigger.onLeaveApproved(final.employeeId, startDateStr, endDateStr);
    await this.notificationService.notify('LEAVE_REQUEST_APPROVED', final.employeeId, { startDate: startDateStr, endDate: endDateStr });
    return final;
  }

  async reject(scope: OrgScope, principal: EmployeePrincipal, id: string, dto: LeaveRejectDto): Promise<LeaveRequest> {
    const row = await this.findWithScope(scope, id);
    const updated = await this.prisma.leaveRequest.updateMany({
      where: { id, version: dto.expectedVersion, status: 'PENDING' },
      data: { status: 'REJECTED', approverId: principal.employeeId, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new LeaveRequestVersionConflictError(id, dto.expectedVersion);
    const final = await this.prisma.leaveRequest.findUniqueOrThrow({ where: { id } });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'LEAVE_REQUEST_REJECTED',
      resourceType: 'LeaveRequest',
      resourceId: id,
      beforeValue: { status: row.status },
      afterValue: { status: final.status },
      reason: dto.reason,
    });
    await this.notificationService.notify('LEAVE_REQUEST_REJECTED', final.employeeId, {
      startDate: toDateString(final.startDate),
      reason: dto.reason,
    });
    return final;
  }

  async approveCancellation(scope: OrgScope, principal: EmployeePrincipal, id: string): Promise<LeaveRequest> {
    const row = await this.findWithScope(scope, id);
    if (row.status !== 'CANCEL_PENDING') throw new LeaveCancellationNotAllowedError(row.status);

    const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.leaveBalanceService.restore(row);
    const startDateStr = toDateString(row.startDate);
    const endDateStr = toDateString(row.endDate);
    await this.recalcTrigger.onLeaveApproved(row.employeeId, startDateStr, endDateStr);

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'LEAVE_CANCELLATION_APPROVED',
      resourceType: 'LeaveRequest',
      resourceId: id,
      beforeValue: { status: row.status },
      afterValue: { status: updated.status },
    });
    await this.notificationService.notify('LEAVE_CANCELLATION_APPROVED', row.employeeId, { startDate: startDateStr });
    return updated;
  }

  async rejectCancellation(scope: OrgScope, principal: EmployeePrincipal, id: string): Promise<LeaveRequest> {
    const row = await this.findWithScope(scope, id);
    if (row.status !== 'CANCEL_PENDING') throw new LeaveCancellationNotAllowedError(row.status);

    const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: 'APPROVED' } });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'LEAVE_CANCELLATION_REJECTED',
      resourceType: 'LeaveRequest',
      resourceId: id,
      beforeValue: { status: row.status },
      afterValue: { status: updated.status },
    });
    await this.notificationService.notify('LEAVE_CANCELLATION_REJECTED', row.employeeId, {
      startDate: toDateString(row.startDate),
    });
    return updated;
  }

  private async findWithScope(scope: OrgScope, id: string): Promise<LeaveRequest> {
    const row = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!row) throw new LeaveRequestNotFoundError(id);
    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: row.employeeId }, select: { primarySiteId: true } });
    assertSiteInScope(scope, employee.primarySiteId);
    return row;
  }
}
