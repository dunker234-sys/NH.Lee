import { BadRequestException, Injectable } from '@nestjs/common';
import { Schedule } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { deriveWorkDateString } from '../../common/time/work-date.util';
import { yearMonthOf } from '../../common/time/week.util';
import { NotificationService } from '../notifications/notification.service';
import { AssignSubstituteDto } from './dto/assign-substitute.dto';
import { BulkPatchSchedulesDto } from './dto/bulk-patch-schedules.dto';
import { ConfirmSchedulesDto } from './dto/confirm-schedules.dto';
import { PatchScheduleCellDto } from './dto/patch-schedule-cell.dto';
import { ScheduleHardBlockError, ScheduleUnresolvedWarningError } from './errors/schedule-errors';
import { ScheduleRepository } from './schedule.repository';
import { ScheduleValidationService, ScheduleValidationTarget } from './schedule-validation.service';

function toTarget(row: Schedule): ScheduleValidationTarget {
  return {
    id: row.id,
    employeeId: row.employeeId,
    siteId: row.siteId,
    shiftTemplateId: row.shiftTemplateId,
    plannedStartAt: row.plannedStartAt,
    plannedEndAt: row.plannedEndAt,
    plannedBreakMinutes: row.plannedBreakMinutes,
  };
}

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ScheduleRepository,
    private readonly validation: ScheduleValidationService,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
  ) {}

  getGrid(scope: OrgScope, siteId: string, yearMonth: string) {
    return this.repo.getGrid(scope, siteId, yearMonth);
  }

  patchOne(scope: OrgScope, id: string, dto: PatchScheduleCellDto): Promise<Schedule> {
    const { expectedVersion, ...fields } = dto;
    return this.repo.patchOne(scope, id, expectedVersion, fields);
  }

  async patchBulk(scope: OrgScope, principal: EmployeePrincipal, dto: BulkPatchSchedulesDto): Promise<Schedule[]> {
    const rows = await this.repo.patchBulk(scope, dto.cells);
    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'SCHEDULE_BULK_SAVED',
      resourceType: 'Schedule',
      afterValue: { cellCount: rows.length, scheduleIds: rows.map((r) => r.id) },
    });
    return rows;
  }

  async confirm(scope: OrgScope, principal: EmployeePrincipal, dto: ConfirmSchedulesDto): Promise<Schedule[]> {
    if (dto.override && !dto.overrideReason) {
      throw new BadRequestException({ code: 'OVERRIDE_REASON_REQUIRED', message: 'override=true이면 overrideReason이 필수입니다.' });
    }

    const rows = await this.prisma.schedule.findMany({ where: { id: { in: dto.scheduleIds } } });
    for (const id of dto.scheduleIds) {
      if (!rows.some((r) => r.id === id)) throw new BadRequestException({ code: 'SCHEDULE_NOT_FOUND', message: `스케줄(${id})을 찾을 수 없습니다.` });
    }

    const { hardBlocks, softWarnings } = await this.validation.validate(rows.map(toTarget));
    if (hardBlocks.length > 0) throw new ScheduleHardBlockError(hardBlocks);
    if (softWarnings.length > 0 && !dto.override) throw new ScheduleUnresolvedWarningError(softWarnings);

    const confirmed = await this.repo.confirmMany(scope, dto.scheduleIds);

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'SCHEDULE_CONFIRMED',
      resourceType: 'Schedule',
      afterValue: { scheduleIds: confirmed.map((r) => r.id) },
      reason: dto.override ? dto.overrideReason : undefined,
    });

    // 직원×년월 단위로 중복 제거해 알림 — targetPeriod/stage가 같으면
    // NotificationService의 기존 dedup(create-idempotent)이 자연히 1건으로
    // 접는다(새 dedup 로직 불필요).
    const notifyKeys = new Set<string>();
    for (const row of confirmed) {
      const yearMonth = yearMonthOf(deriveWorkDateString(row.plannedStartAt));
      const key = `${row.employeeId}:${yearMonth}`;
      if (notifyKeys.has(key)) continue;
      notifyKeys.add(key);
      await this.notificationService.notify('SCHEDULE_CONFIRMED', row.employeeId, { yearMonth }, { targetPeriod: yearMonth, stage: 'CONFIRM' });
    }

    return confirmed;
  }

  async cancel(scope: OrgScope, principal: EmployeePrincipal, id: string): Promise<Schedule> {
    const before = await this.repo.findById(scope, id);
    const after = await this.repo.cancelOne(scope, id);
    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'SCHEDULE_CANCELLED',
      resourceType: 'Schedule',
      resourceId: id,
      beforeValue: { status: before.status },
      afterValue: { status: after.status },
    });
    return after;
  }

  async assignSubstitute(scope: OrgScope, principal: EmployeePrincipal, originalId: string, dto: AssignSubstituteDto): Promise<Schedule> {
    const original = await this.repo.findById(scope, originalId);

    let reason = dto.reason ?? null;
    if (!reason) {
      const leave = await this.prisma.leaveRequest.findFirst({
        where: {
          employeeId: original.employeeId,
          status: 'APPROVED',
          startDate: { lte: original.workDate },
          endDate: { gte: original.workDate },
        },
        include: { leaveType: true },
      });
      if (leave) reason = `승인된 휴가(${leave.leaveType.name})로 인한 대체`;
    }

    const created = await this.repo.createSubstitute(scope, original, dto.substituteEmployeeId, dto.assignmentType, reason);
    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'SCHEDULE_SUBSTITUTE_ASSIGNED',
      resourceType: 'Schedule',
      resourceId: created.id,
      afterValue: { originalScheduleId: original.id, originalEmployeeId: original.employeeId, substituteEmployeeId: dto.substituteEmployeeId, assignmentType: dto.assignmentType, reason },
    });
    return created;
  }
}
