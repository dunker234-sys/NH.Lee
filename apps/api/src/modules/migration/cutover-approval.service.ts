import { Injectable } from '@nestjs/common';
import { SiteCutover } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly } from '../../common/time/week.util';
import { ApprovalLineResolverService } from '../approval/approval-line-resolver.service';
import { NotificationService } from '../notifications/notification.service';
import { CutoverGuardService } from './cutover-guard.service';
import { CutoverReconciliationNotZeroError } from './errors/migration-errors';
import { SiteCutoverService } from './site-cutover.service';

/** ★ 요구사항서4.3(STEP7.5) §4 — "차이가 0이 될 때까지 개통을 승인하지
 * 않는다"를 실제로 시스템이 차단하는 지점. */
@Injectable()
export class CutoverApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteCutoverService: SiteCutoverService,
    private readonly guard: CutoverGuardService,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly approvalLine: ApprovalLineResolverService,
  ) {}

  async approve(scope: OrgScope, principal: EmployeePrincipal, siteId: string): Promise<SiteCutover> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);

    const cutover = await this.siteCutoverService.getOrThrow(siteId);
    if (cutover.status === 'APPROVED') return cutover;

    const readiness = await this.guard.isReadyForApproval(siteId);
    if (!readiness.ready) throw new CutoverReconciliationNotZeroError(siteId, readiness.unresolvedCount, readiness.totalRecords);

    const approvedAt = new Date();
    const updated = await this.prisma.siteCutover.update({
      where: { siteId },
      data: { status: 'APPROVED', approvedAt, approvedBy: principal.employeeId },
    });

    await this.auditLog.write({
      actorPrincipal: principal.employeeNo,
      actorRole: principal.role,
      eventType: 'CUTOVER_APPROVED',
      resourceType: 'site_cutover',
      resourceId: updated.id,
      beforeValue: { status: 'PENDING' },
      afterValue: { status: 'APPROVED', approvedAt: approvedAt.toISOString() },
    });

    const recipients = await this.approvalLine.resolveApprovers(siteId, dateOnly(cutover.cutoverDate.toISOString().slice(0, 10)));
    for (const recipient of recipients) {
      await this.notificationService.notify('SITE_CUTOVER_APPROVED', recipient.employeeId, { siteId, cutoverDate: cutover.cutoverDate.toISOString().slice(0, 10) });
    }

    return updated;
  }
}
