import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OvertimeRequest, OvertimeRequestStatus } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly } from '../../common/time/week.util';
import { RecalculationTriggerService } from '../recalculation/recalculation-trigger.service';
import { NotificationService } from '../notifications/notification.service';
import { ApproveRejectDto } from './dto/approve-reject.dto';
import { BulkApproveOvertimeDto } from './dto/bulk-approve-overtime.dto';
import { OvertimeRequestNotFoundError, OvertimeRequestVersionConflictError } from './errors/approval-errors';

export interface UnapprovedActualRow {
  employeeId: string;
  employeeName: string;
  workDate: string;
  unapprovedOvertimeMinutes: number;
  existingRequestId: string | null;
  existingRequestStatus: OvertimeRequestStatus | null;
}

export interface BulkApproveResult {
  batchId: string;
  approvedCount: number;
  skippedCount: number;
  overtimeRequestIds: string[];
  skipped: { employeeId: string; targetDate: string; reason: string }[];
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class OvertimeApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly recalcTrigger: RecalculationTriggerService,
  ) {}

  async list(
    scope: OrgScope,
    params: { siteId?: string; status?: OvertimeRequestStatus; from?: string; to?: string },
  ): Promise<OvertimeRequest[]> {
    assertScope(scope);
    if (params.siteId) assertSiteInScope(scope, params.siteId);
    const siteIds = params.siteId ? [params.siteId] : scope.kind === 'ALL' ? undefined : scope.siteIds;

    return this.prisma.overtimeRequest.findMany({
      where: {
        status: params.status,
        targetDate: params.from && params.to ? { gte: dateOnly(params.from), lte: dateOnly(params.to) } : undefined,
        employee: siteIds ? { siteAssignments: { some: { siteId: { in: siteIds } } } } : undefined,
      },
      orderBy: { targetDate: 'desc' },
    });
  }

  async unapprovedActuals(scope: OrgScope, siteId: string, from: string, to: string): Promise<UnapprovedActualRow[]> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);

    const dailies = await this.prisma.attendanceDaily.findMany({
      where: { siteId, status: 'UNAPPROVED_ACTUAL', workDate: { gte: dateOnly(from), lte: dateOnly(to) } },
      include: { employee: { select: { name: true } } },
      orderBy: [{ workDate: 'asc' }, { employeeId: 'asc' }],
    });

    const results: UnapprovedActualRow[] = [];
    for (const d of dailies) {
      const existing = await this.prisma.overtimeRequest.findFirst({
        where: { employeeId: d.employeeId, targetDate: d.workDate },
        orderBy: { createdAt: 'desc' },
      });
      results.push({
        employeeId: d.employeeId,
        employeeName: d.employee.name,
        workDate: toDateString(d.workDate),
        unapprovedOvertimeMinutes: d.unapprovedOvertimeMinutes,
        existingRequestId: existing?.id ?? null,
        existingRequestStatus: existing?.status ?? null,
      });
    }
    return results;
  }

  async approve(scope: OrgScope, principal: EmployeePrincipal, id: string, dto: ApproveRejectDto): Promise<OvertimeRequest> {
    const row = await this.findWithScope(scope, id);
    const updated = await this.prisma.overtimeRequest.updateMany({
      where: { id, version: dto.expectedVersion, status: 'PENDING' },
      data: { status: 'APPROVED', approverId: principal.employeeId, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new OvertimeRequestVersionConflictError(id, dto.expectedVersion);
    const final = await this.prisma.overtimeRequest.findUniqueOrThrow({ where: { id } });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'OVERTIME_REQUEST_APPROVED',
      resourceType: 'OvertimeRequest',
      resourceId: id,
      beforeValue: { status: row.status },
      afterValue: { status: final.status },
    });
    await this.recalcTrigger.onOvertimeOrDispatchApproved(final.employeeId, toDateString(final.targetDate));
    await this.notificationService.notify('OVERTIME_REQUEST_APPROVED', final.employeeId, { targetDate: toDateString(final.targetDate) });
    return final;
  }

  async reject(scope: OrgScope, principal: EmployeePrincipal, id: string, dto: ApproveRejectDto): Promise<OvertimeRequest> {
    const row = await this.findWithScope(scope, id);
    const updated = await this.prisma.overtimeRequest.updateMany({
      where: { id, version: dto.expectedVersion, status: 'PENDING' },
      data: { status: 'REJECTED', approverId: principal.employeeId, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new OvertimeRequestVersionConflictError(id, dto.expectedVersion);
    const final = await this.prisma.overtimeRequest.findUniqueOrThrow({ where: { id } });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'OVERTIME_REQUEST_REJECTED',
      resourceType: 'OvertimeRequest',
      resourceId: id,
      beforeValue: { status: row.status },
      afterValue: { status: final.status },
      reason: dto.reason,
    });
    await this.notificationService.notify('OVERTIME_REQUEST_REJECTED', final.employeeId, { targetDate: toDateString(final.targetDate) });
    return final;
  }

  /**
   * ★ 급식 현장은 건별 사전승인이 비현실적이라 미승인 실적 목록에서 다중
   * 선택 승인한다. 버전 체크 생략 — status='PENDING' 또는 행 자체가 없는
   * 상태 자체가 동시성 가드다(schedule.confirmMany()와 같은 이유).
   */
  async bulkApprove(scope: OrgScope, principal: EmployeePrincipal, dto: BulkApproveOvertimeDto): Promise<BulkApproveResult> {
    assertScope(scope);
    const batchId = randomUUID();
    const overtimeRequestIds: string[] = [];
    const skipped: { employeeId: string; targetDate: string; reason: string }[] = [];
    const affectedPairs: { employeeId: string; targetDate: string }[] = [];
    const notifyTargets = new Set<string>();

    for (const item of dto.items) {
      const employee = await this.prisma.employee.findUniqueOrThrow({
        where: { id: item.employeeId },
        select: { primarySiteId: true },
      });
      assertSiteInScope(scope, employee.primarySiteId);

      const targetDateObj = dateOnly(item.targetDate);
      const existing = await this.prisma.overtimeRequest.findFirst({
        where: { employeeId: item.employeeId, targetDate: targetDateObj },
        orderBy: { createdAt: 'desc' },
      });

      if (existing?.status === 'APPROVED') {
        skipped.push({ employeeId: item.employeeId, targetDate: item.targetDate, reason: 'ALREADY_APPROVED' });
        continue;
      }

      if (existing?.status === 'PENDING') {
        const updated = await this.prisma.overtimeRequest.updateMany({
          where: { id: existing.id, status: 'PENDING' },
          data: { status: 'APPROVED', approverId: principal.employeeId, bulkApprovalBatchId: batchId },
        });
        if (updated.count === 0) {
          skipped.push({ employeeId: item.employeeId, targetDate: item.targetDate, reason: 'CONCURRENTLY_PROCESSED' });
          continue;
        }
        overtimeRequestIds.push(existing.id);
      } else {
        // 기존 요청 없음(또는 REJECTED/CANCELLED) — AttendanceDaily의 미승인
        // 실적을 스냅샷해 POST 유형으로 즉시 생성+승인한다. 이 한 번의 생성이
        // "사후 신청"과 "일괄 승인"을 동시에 만족한다.
        const daily = await this.prisma.attendanceDaily.findUnique({
          where: { employeeId_workDate: { employeeId: item.employeeId, workDate: targetDateObj } },
        });
        if (!daily || daily.unapprovedOvertimeMinutes <= 0) {
          skipped.push({ employeeId: item.employeeId, targetDate: item.targetDate, reason: 'NO_UNAPPROVED_ACTUAL' });
          continue;
        }
        const created = await this.prisma.overtimeRequest.create({
          data: {
            employeeId: item.employeeId,
            requestType: 'POST',
            targetDate: targetDateObj,
            expectedMinutes: daily.unapprovedOvertimeMinutes,
            reason: dto.reason?.trim() || '관리자 일괄 승인(사후 신청)',
            status: 'APPROVED',
            approverId: principal.employeeId,
            bulkApprovalBatchId: batchId,
          },
        });
        overtimeRequestIds.push(created.id);
      }

      affectedPairs.push({ employeeId: item.employeeId, targetDate: item.targetDate });
      notifyTargets.add(item.employeeId);
    }

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'OVERTIME_BULK_APPROVED',
      resourceType: 'OvertimeRequest',
      afterValue: { batchId, approvedCount: overtimeRequestIds.length, skippedCount: skipped.length, overtimeRequestIds, skipped },
      reason: dto.reason,
    });

    for (const pair of affectedPairs) {
      await this.recalcTrigger.onOvertimeOrDispatchApproved(pair.employeeId, pair.targetDate);
    }
    for (const employeeId of notifyTargets) {
      await this.notificationService.notify('OVERTIME_REQUEST_APPROVED', employeeId, { batch: true });
    }

    return { batchId, approvedCount: overtimeRequestIds.length, skippedCount: skipped.length, overtimeRequestIds, skipped };
  }

  private async findWithScope(scope: OrgScope, id: string): Promise<OvertimeRequest> {
    const row = await this.prisma.overtimeRequest.findUnique({ where: { id } });
    if (!row) throw new OvertimeRequestNotFoundError(id);
    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: row.employeeId }, select: { primarySiteId: true } });
    assertSiteInScope(scope, employee.primarySiteId);
    return row;
  }
}
