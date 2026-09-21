import { Injectable } from '@nestjs/common';
import { WorkNotProvidedJudgment } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly } from '../../common/time/week.util';
import { RecalculationTriggerService } from '../recalculation/recalculation-trigger.service';
import { NotificationService } from '../notifications/notification.service';
import { JudgeWorkNotProvidedDto } from './dto/judge-work-not-provided.dto';
import { WorkNotProvidedReasonRequiredError } from './errors/approval-errors';

@Injectable()
export class WorkNotProvidedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly recalcTrigger: RecalculationTriggerService,
  ) {}

  async judge(scope: OrgScope, principal: EmployeePrincipal, dto: JudgeWorkNotProvidedDto): Promise<WorkNotProvidedJudgment> {
    // DTO의 @IsNotEmpty()와 이중 방어 — schedule.confirm()의 overrideReason
    // 체크와 동일 패턴. 사유 없이는 어떤 경로로도 저장되지 않는다.
    if (!dto.reason?.trim()) throw new WorkNotProvidedReasonRequiredError();

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: dto.employeeId },
      select: { primarySiteId: true },
    });
    const workDateObj = dateOnly(dto.workDate);
    const daily = await this.prisma.attendanceDaily.findUnique({
      where: { employeeId_workDate: { employeeId: dto.employeeId, workDate: workDateObj } },
      select: { siteId: true },
    });
    const siteId = daily?.siteId ?? employee.primarySiteId;
    assertSiteInScope(scope, siteId);

    const before = await this.prisma.workNotProvidedJudgment.findUnique({
      where: { employeeId_workDate: { employeeId: dto.employeeId, workDate: workDateObj } },
    });

    const after = await this.prisma.workNotProvidedJudgment.upsert({
      where: { employeeId_workDate: { employeeId: dto.employeeId, workDate: workDateObj } },
      create: { employeeId: dto.employeeId, siteId, workDate: workDateObj, reason: dto.reason, judgedBy: principal.employeeId },
      update: { reason: dto.reason, judgedBy: principal.employeeId, judgedAt: new Date() },
    });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'WORK_NOT_PROVIDED_JUDGED',
      resourceType: 'WorkNotProvidedJudgment',
      resourceId: after.id,
      beforeValue: before,
      afterValue: after,
      reason: dto.reason,
    });

    await this.notificationService.notify('WORK_NOT_PROVIDED_JUDGED', dto.employeeId, { workDate: dto.workDate, reason: dto.reason });
    await this.recalcTrigger.onWorkNotProvidedJudged(dto.employeeId, dto.workDate);

    return after;
  }

  async list(scope: OrgScope, params: { siteId?: string; from?: string; to?: string }): Promise<WorkNotProvidedJudgment[]> {
    assertScope(scope);
    if (params.siteId) assertSiteInScope(scope, params.siteId);
    const siteIds = params.siteId ? [params.siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    return this.prisma.workNotProvidedJudgment.findMany({
      where: {
        siteId: siteIds ? { in: siteIds } : undefined,
        workDate: params.from && params.to ? { gte: dateOnly(params.from), lte: dateOnly(params.to) } : undefined,
      },
      orderBy: { workDate: 'desc' },
    });
  }
}
