import { Injectable } from '@nestjs/common';
import { Schedule, ScheduleAssignmentType, ScheduleStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { deriveWorkDate, deriveWorkDateString } from '../../common/time/work-date.util';
import { dateOnly, monthRange } from '../../common/time/week.util';
import {
  ScheduleBulkVersionConflictError,
  ScheduleConflictValue,
  ScheduleNotFoundError,
  ScheduleVersionConflictError,
} from './errors/schedule-errors';
import { computeScheduleGridVersion } from './schedule-version.util';

export interface SchedulePatchFields {
  shiftTemplateId?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  plannedBreakMinutes?: number;
  assignmentType?: ScheduleAssignmentType;
}

export interface BulkPatchCell extends SchedulePatchFields {
  id: string;
  expectedVersion: number;
}

function serialize(row: Schedule): Record<string, unknown> {
  return {
    version: row.version,
    plannedStartAt: row.plannedStartAt.toISOString(),
    plannedEndAt: row.plannedEndAt.toISOString(),
    plannedBreakMinutes: row.plannedBreakMinutes,
    assignmentType: row.assignmentType,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildUpdateData(patch: SchedulePatchFields) {
  const data: Record<string, unknown> = {};
  if (patch.shiftTemplateId !== undefined) data.shiftTemplateId = patch.shiftTemplateId;
  if (patch.plannedStartAt !== undefined) {
    const start = new Date(patch.plannedStartAt);
    data.plannedStartAt = start;
    data.workDate = deriveWorkDate(start); // 절대 규칙5: 항상 시업일 기준으로 재계산
  }
  if (patch.plannedEndAt !== undefined) data.plannedEndAt = new Date(patch.plannedEndAt);
  if (patch.plannedBreakMinutes !== undefined) data.plannedBreakMinutes = patch.plannedBreakMinutes;
  if (patch.assignmentType !== undefined) data.assignmentType = patch.assignmentType;
  return data;
}

@Injectable()
export class ScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getGrid(scope: OrgScope, siteId: string, yearMonth: string): Promise<{ scheduleGridVersion: string; rows: Schedule[] }> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const { start, end } = monthRange(yearMonth);
    const rows = await this.prisma.schedule.findMany({
      where: { siteId, workDate: { gte: start, lt: end } },
      orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
    });
    return { scheduleGridVersion: computeScheduleGridVersion(rows), rows };
  }

  async findById(scope: OrgScope, id: string): Promise<Schedule> {
    assertScope(scope);
    const row = await this.prisma.schedule.findUnique({ where: { id } });
    if (!row) throw new ScheduleNotFoundError(id);
    assertSiteInScope(scope, row.siteId);
    return row;
  }

  async patchOne(scope: OrgScope, id: string, expectedVersion: number, patch: SchedulePatchFields): Promise<Schedule> {
    await this.findById(scope, id); // 존재+스코프 확인
    const data = buildUpdateData(patch);
    const result = await this.prisma.schedule.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) {
      const current = await this.prisma.schedule.findUnique({ where: { id } });
      throw new ScheduleVersionConflictError({
        scheduleId: id,
        yourValue: { expectedVersion, ...patch },
        currentValue: current ? serialize(current) : null,
      });
    }
    return this.prisma.schedule.findUniqueOrThrow({ where: { id } });
  }

  /** 하나라도 충돌하면 전체 롤백(부분 적용 없음). */
  async patchBulk(scope: OrgScope, cells: BulkPatchCell[]): Promise<Schedule[]> {
    assertScope(scope);
    const existingRows = await this.prisma.schedule.findMany({ where: { id: { in: cells.map((c) => c.id) } } });
    const existingById = new Map(existingRows.map((r) => [r.id, r]));
    for (const cell of cells) {
      const existing = existingById.get(cell.id);
      if (existing) assertSiteInScope(scope, existing.siteId);
    }

    class BulkConflictSentinel extends Error {
      constructor(readonly failedIds: Set<string>) {
        super('bulk-conflict-rollback');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const failedIds = new Set<string>();
        for (const cell of cells) {
          const data = buildUpdateData(cell);
          const result = await tx.schedule.updateMany({
            where: { id: cell.id, version: cell.expectedVersion },
            data: { ...data, version: { increment: 1 } },
          });
          if (result.count === 0) failedIds.add(cell.id);
        }
        if (failedIds.size > 0) throw new BulkConflictSentinel(failedIds);
        return tx.schedule.findMany({ where: { id: { in: cells.map((c) => c.id) } } });
      });
    } catch (e) {
      if (e instanceof BulkConflictSentinel) {
        const currentRows = await this.prisma.schedule.findMany({ where: { id: { in: [...e.failedIds] } } });
        const currentById = new Map(currentRows.map((r) => [r.id, r]));
        const conflicts: ScheduleConflictValue[] = cells
          .filter((c) => e.failedIds.has(c.id))
          .map((c) => ({
            scheduleId: c.id,
            yourValue: { ...c },
            currentValue: currentById.has(c.id) ? serialize(currentById.get(c.id)!) : null,
          }));
        throw new ScheduleBulkVersionConflictError(conflicts);
      }
      throw e;
    }
  }

  async confirmMany(scope: OrgScope, scheduleIds: string[]): Promise<Schedule[]> {
    assertScope(scope);
    const rows = await this.prisma.schedule.findMany({ where: { id: { in: scheduleIds } } });
    for (const row of rows) assertSiteInScope(scope, row.siteId);
    await this.prisma.schedule.updateMany({
      where: { id: { in: scheduleIds } },
      data: { status: 'CONFIRMED' as ScheduleStatus },
    });
    return this.prisma.schedule.findMany({ where: { id: { in: scheduleIds } } });
  }

  async cancelOne(scope: OrgScope, id: string): Promise<Schedule> {
    const existing = await this.findById(scope, id);
    return this.prisma.schedule.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
  }

  async createSubstitute(
    scope: OrgScope,
    original: Schedule,
    substituteEmployeeId: string,
    assignmentType: ScheduleAssignmentType,
    reason: string | null,
  ): Promise<Schedule> {
    assertScope(scope);
    assertSiteInScope(scope, original.siteId);
    return this.prisma.schedule.create({
      data: {
        employeeId: substituteEmployeeId,
        siteId: original.siteId,
        workDate: original.workDate,
        shiftTemplateId: original.shiftTemplateId,
        plannedStartAt: original.plannedStartAt,
        plannedEndAt: original.plannedEndAt,
        plannedBreakMinutes: original.plannedBreakMinutes,
        substituteForEmployeeId: original.employeeId,
        substituteReason: reason,
        assignmentType,
      },
    });
  }

  async generateRoster(
    rows: {
      employeeId: string;
      siteId: string;
      workDate: string;
      shiftTemplateId: string;
      plannedStartAt: Date;
      plannedEndAt: Date;
      plannedBreakMinutes: number;
    }[],
  ): Promise<Schedule[]> {
    return this.prisma.schedule.createManyAndReturn({
      data: rows.map((r) => ({
        employeeId: r.employeeId,
        siteId: r.siteId,
        workDate: dateOnly(deriveWorkDateString(r.plannedStartAt)),
        shiftTemplateId: r.shiftTemplateId,
        plannedStartAt: r.plannedStartAt,
        plannedEndAt: r.plannedEndAt,
        plannedBreakMinutes: r.plannedBreakMinutes,
      })),
    });
  }
}
