import { Injectable } from '@nestjs/common';
import { DispatchRequest, DispatchStatus } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { enumerateDates } from '../../common/time/week.util';
import { RecalculationTriggerService } from '../recalculation/recalculation-trigger.service';
import { NotificationService } from '../notifications/notification.service';
import { ApproveRejectDto } from './dto/approve-reject.dto';
import { DispatchRequestNotFoundError, DispatchRequestVersionConflictError } from './errors/approval-errors';

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class DispatchApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly recalcTrigger: RecalculationTriggerService,
  ) {}

  async list(scope: OrgScope, params: { siteId?: string; status?: DispatchStatus }): Promise<DispatchRequest[]> {
    assertScope(scope);
    if (params.siteId) assertSiteInScope(scope, params.siteId);
    const siteIds = params.siteId ? [params.siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    return this.prisma.dispatchRequest.findMany({
      where: {
        status: params.status,
        originSiteId: siteIds ? { in: siteIds } : undefined,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async approve(scope: OrgScope, principal: EmployeePrincipal, id: string, dto: ApproveRejectDto): Promise<DispatchRequest> {
    const row = await this.findWithScope(scope, id);
    const updated = await this.prisma.dispatchRequest.updateMany({
      where: { id, version: dto.expectedVersion, status: 'PENDING' },
      data: { status: 'APPROVED', version: { increment: 1 } },
    });
    if (updated.count === 0) throw new DispatchRequestVersionConflictError(id, dto.expectedVersion);
    const final = await this.prisma.dispatchRequest.findUniqueOrThrow({ where: { id } });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'DISPATCH_REQUEST_APPROVED',
      resourceType: 'DispatchRequest',
      resourceId: id,
      beforeValue: { status: row.status },
      afterValue: { status: final.status },
    });

    for (const workDate of enumerateDates(toDateString(final.startDate), toDateString(final.endDate))) {
      await this.recalcTrigger.onOvertimeOrDispatchApproved(final.employeeId, workDate);
    }
    await this.notificationService.notify('DISPATCH_REQUEST_APPROVED', final.employeeId, {
      startDate: toDateString(final.startDate),
      endDate: toDateString(final.endDate),
    });
    return final;
  }

  async reject(scope: OrgScope, principal: EmployeePrincipal, id: string, dto: ApproveRejectDto): Promise<DispatchRequest> {
    const row = await this.findWithScope(scope, id);
    const updated = await this.prisma.dispatchRequest.updateMany({
      where: { id, version: dto.expectedVersion, status: 'PENDING' },
      data: { status: 'REJECTED', version: { increment: 1 } },
    });
    if (updated.count === 0) throw new DispatchRequestVersionConflictError(id, dto.expectedVersion);
    const final = await this.prisma.dispatchRequest.findUniqueOrThrow({ where: { id } });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'DISPATCH_REQUEST_REJECTED',
      resourceType: 'DispatchRequest',
      resourceId: id,
      beforeValue: { status: row.status },
      afterValue: { status: final.status },
      reason: dto.reason,
    });
    await this.notificationService.notify('DISPATCH_REQUEST_REJECTED', final.employeeId, {
      startDate: toDateString(final.startDate),
      endDate: toDateString(final.endDate),
    });
    return final;
  }

  private async findWithScope(scope: OrgScope, id: string): Promise<DispatchRequest> {
    const row = await this.prisma.dispatchRequest.findUnique({ where: { id } });
    if (!row) throw new DispatchRequestNotFoundError(id);
    assertSiteInScope(scope, row.originSiteId);
    return row;
  }
}
