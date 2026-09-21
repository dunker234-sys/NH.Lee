import { Injectable } from '@nestjs/common';
import { CorrectionRequest, CorrectionRequestSource, CorrectionStatus } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CorrectionPolicyResolverService } from '../../common/policy/correction-policy-resolver.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { addDays, dateOnly, monthRange, yearMonthOf } from '../../common/time/week.util';
import { ApprovalLineResolverService } from '../approval/approval-line-resolver.service';
import { NotificationService } from '../notifications/notification.service';
import { assertValidAfterValueForSubmission } from '../../common/correction/correction-payload.util';
import { assertCorrectionTargetPeriodOpen } from './correction-period-guard.util';
import { SubmitCorrectionDto } from './dto/submit-correction.dto';
import { CorrectionRequestDeadlinePassedError, MalformedCorrectionPayloadSubmissionError } from './errors/correction-errors';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 정정 신청 자체(제출/조회) — 승인/거절은 CorrectionApprovalService, 직권 정정은 AdminCorrectionService. */
@Injectable()
export class CorrectionRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CorrectionPolicyResolverService,
    private readonly auditLog: AuditLogService,
    private readonly approvalLine: ApprovalLineResolverService,
    private readonly notificationService: NotificationService,
  ) {}

  async submit(principal: EmployeePrincipal, dto: SubmitCorrectionDto): Promise<CorrectionRequest> {
    try {
      assertValidAfterValueForSubmission(dto.reasonCode, dto.afterValue);
    } catch (e) {
      throw new MalformedCorrectionPayloadSubmissionError((e as Error).message);
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: principal.employeeId },
      select: { name: true, primarySiteId: true },
    });
    const siteId = employee.primarySiteId;

    await assertCorrectionTargetPeriodOpen(this.prisma, siteId, dto.targetWorkDate);
    await this.assertWithinDeadline(siteId, dto.targetWorkDate);

    const created = await this.prisma.correctionRequest.create({
      data: {
        employeeId: principal.employeeId,
        targetPunchId: dto.targetPunchId,
        targetWorkDate: dateOnly(dto.targetWorkDate),
        reasonCode: dto.reasonCode,
        reasonDetail: dto.reasonDetail,
        afterValue: dto.afterValue as never,
        evidenceUrl: dto.evidenceUrl,
        requestSource: 'EMPLOYEE',
        status: 'PENDING',
      },
    });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'CORRECTION_REQUESTED',
      resourceType: 'CorrectionRequest',
      resourceId: created.id,
      subjectEmployeeId: principal.employeeId,
      afterValue: { reasonCode: created.reasonCode, targetWorkDate: dto.targetWorkDate },
    });

    const approvers = await this.approvalLine.resolveApprovers(siteId, dateOnly(dto.targetWorkDate));
    for (const approver of approvers) {
      await this.notificationService.notify('CORRECTION_REQUEST_SUBMITTED', approver.employeeId, {
        employeeName: employee.name,
        targetWorkDate: dto.targetWorkDate,
      });
    }

    return created;
  }

  listMine(employeeId: string, status?: CorrectionStatus): Promise<CorrectionRequest[]> {
    return this.prisma.correctionRequest.findMany({
      where: { employeeId, status },
      orderBy: { targetWorkDate: 'desc' },
    });
  }

  async listForApproval(
    scope: OrgScope,
    params: { siteId?: string; status?: CorrectionStatus; employeeId?: string; requestSource?: CorrectionRequestSource; from?: string; to?: string },
  ): Promise<CorrectionRequest[]> {
    assertScope(scope);
    if (params.siteId) assertSiteInScope(scope, params.siteId);
    const siteIds = params.siteId ? [params.siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    return this.prisma.correctionRequest.findMany({
      where: {
        status: params.status,
        employeeId: params.employeeId,
        requestSource: params.requestSource,
        targetWorkDate: params.from && params.to ? { gte: dateOnly(params.from), lte: dateOnly(params.to) } : undefined,
        employee: siteIds ? { siteAssignments: { some: { siteId: { in: siteIds } } } } : undefined,
      },
      orderBy: { targetWorkDate: 'desc' },
    });
  }

  private async assertWithinDeadline(siteId: string, targetWorkDate: string): Promise<void> {
    const policy = await this.policy.resolve(siteId, dateOnly(targetWorkDate));
    const { end } = monthRange(yearMonthOf(targetWorkDate));
    const monthEnd = addDays(end.toISOString().slice(0, 10), -1);
    const deadline = addDays(monthEnd, policy.correctionRequestDeadlineDaysAfterMonthEnd);
    if (today() > deadline) {
      throw new CorrectionRequestDeadlinePassedError(targetWorkDate, policy.correctionRequestDeadlineDaysAfterMonthEnd);
    }
  }
}
