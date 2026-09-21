import { Injectable } from '@nestjs/common';
import { CorrectionRequest, CorrectionStatus } from '@prisma/client';
import { ApproveRejectDto } from '../approval/dto/approve-reject.dto';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CorrectionPolicyResolverService } from '../../common/policy/correction-policy-resolver.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertSiteInScope } from '../../common/scope/scope.util';
import { RecalculationTriggerService } from '../recalculation/recalculation-trigger.service';
import { NotificationService } from '../notifications/notification.service';
import { assertCorrectionTargetPeriodOpen } from './correction-period-guard.util';
import { CorrectionRequestNotFoundError, CorrectionRequestVersionConflictError } from './errors/correction-errors';

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 2단계 승인(PENDING→APPROVED_L1→APPROVED_L2). AttendanceInputBuilderService는
 * APPROVED_L1/APPROVED_L2 둘 다 계산에 반영하므로("승인 즉시 재계산") 어느
 * 단계로 전이하든 재계산을 트리거한다. overtime-approval.service.ts와 동일한
 * 낙관적 잠금 패턴(updateMany where version+status).
 */
@Injectable()
export class CorrectionApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CorrectionPolicyResolverService,
    private readonly auditLog: AuditLogService,
    private readonly recalcTrigger: RecalculationTriggerService,
    private readonly notificationService: NotificationService,
  ) {}

  async approve(scope: OrgScope, principal: EmployeePrincipal, id: string, dto: ApproveRejectDto): Promise<CorrectionRequest> {
    const row = await this.findWithScope(scope, id);
    const siteId = await this.resolveSiteId(row.employeeId);
    await assertCorrectionTargetPeriodOpen(this.prisma, siteId, toDateString(row.targetWorkDate));

    const { targetStatus, allowedFromStatuses } = await this.resolveTransition(principal, siteId);

    const updated = await this.prisma.correctionRequest.updateMany({
      where: { id, version: dto.expectedVersion, status: { in: allowedFromStatuses } },
      data: { status: targetStatus, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new CorrectionRequestVersionConflictError(id, dto.expectedVersion);
    const final = await this.prisma.correctionRequest.findUniqueOrThrow({ where: { id } });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'CORRECTION_APPROVED',
      resourceType: 'CorrectionRequest',
      resourceId: id,
      subjectEmployeeId: final.employeeId,
      beforeValue: { status: row.status },
      afterValue: { status: final.status },
    });

    const targetWorkDateStr = toDateString(final.targetWorkDate);
    await this.recalcTrigger.onCorrectionApproved(final.employeeId, targetWorkDateStr);
    await this.notificationService.notify('CORRECTION_REQUEST_APPROVED', final.employeeId, { targetWorkDate: targetWorkDateStr });

    return final;
  }

  async reject(scope: OrgScope, principal: EmployeePrincipal, id: string, dto: ApproveRejectDto): Promise<CorrectionRequest> {
    const row = await this.findWithScope(scope, id);

    const updated = await this.prisma.correctionRequest.updateMany({
      where: { id, version: dto.expectedVersion, status: { in: ['PENDING', 'APPROVED_L1'] } },
      data: { status: 'REJECTED', version: { increment: 1 } },
    });
    if (updated.count === 0) throw new CorrectionRequestVersionConflictError(id, dto.expectedVersion);
    const final = await this.prisma.correctionRequest.findUniqueOrThrow({ where: { id } });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'CORRECTION_REJECTED',
      resourceType: 'CorrectionRequest',
      resourceId: id,
      subjectEmployeeId: final.employeeId,
      beforeValue: { status: row.status },
      afterValue: { status: final.status },
      reason: dto.reason,
    });

    await this.notificationService.notify('CORRECTION_REQUEST_REJECTED', final.employeeId, {
      targetWorkDate: toDateString(final.targetWorkDate),
      reason: dto.reason ?? '',
    });

    return final;
  }

  private async resolveTransition(
    principal: EmployeePrincipal,
    siteId: string,
  ): Promise<{ targetStatus: CorrectionStatus; allowedFromStatuses: CorrectionStatus[] }> {
    if (principal.role === 'SITE_MANAGER') {
      const policy = await this.policy.resolve(siteId, new Date());
      const targetStatus: CorrectionStatus = policy.correctionRequiresSecondApproval !== 0 ? 'APPROVED_L1' : 'APPROVED_L2';
      return { targetStatus, allowedFromStatuses: ['PENDING'] };
    }
    // REGIONAL/HQ_HR/ADMIN — 결재선을 건너뛰고 바로 최종 승인 가능(상급자는
    // 1차를 거칠 필요가 없다는 계층 구조상 자연스러운 허용).
    return { targetStatus: 'APPROVED_L2', allowedFromStatuses: ['PENDING', 'APPROVED_L1'] };
  }

  private async resolveSiteId(employeeId: string): Promise<string> {
    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { primarySiteId: true } });
    return employee.primarySiteId;
  }

  private async findWithScope(scope: OrgScope, id: string): Promise<CorrectionRequest> {
    const row = await this.prisma.correctionRequest.findUnique({ where: { id } });
    if (!row) throw new CorrectionRequestNotFoundError(id);
    const siteId = await this.resolveSiteId(row.employeeId);
    assertSiteInScope(scope, siteId);
    return row;
  }
}
