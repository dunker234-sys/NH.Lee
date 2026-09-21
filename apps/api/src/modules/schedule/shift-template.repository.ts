import { Injectable, NotFoundException } from '@nestjs/common';
import { ShiftTemplate } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { ShiftTemplateInUseError } from './errors/schedule-errors';
import { formatTimeOfDay } from './schedule-date.util';

function timeOfDay(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}

export interface ShiftTemplateInput {
  siteId: string;
  name: string;
  startTime: string;
  endTime: string;
  breakStartTime?: string;
  breakEndTime?: string;
  crossesMidnight: boolean;
  applicableWeekdays: number[];
  flexibleWorkType?: string | null;
}

@Injectable()
export class ShiftTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(scope: OrgScope, input: ShiftTemplateInput): Promise<ShiftTemplate> {
    assertScope(scope);
    assertSiteInScope(scope, input.siteId);
    return this.prisma.shiftTemplate.create({
      data: {
        siteId: input.siteId,
        name: input.name,
        startTime: timeOfDay(input.startTime),
        endTime: timeOfDay(input.endTime),
        breakStartTime: input.breakStartTime ? timeOfDay(input.breakStartTime) : undefined,
        breakEndTime: input.breakEndTime ? timeOfDay(input.breakEndTime) : undefined,
        crossesMidnight: input.crossesMidnight,
        applicableWeekdays: input.applicableWeekdays,
        flexibleWorkType: input.flexibleWorkType ?? undefined,
      },
    });
  }

  async list(scope: OrgScope, siteId: string): Promise<ShiftTemplate[]> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.prisma.shiftTemplate.findMany({ where: { siteId }, orderBy: { startTime: 'asc' } });
  }

  async findById(scope: OrgScope, id: string): Promise<ShiftTemplate> {
    assertScope(scope);
    const tmpl = await this.prisma.shiftTemplate.findUnique({ where: { id } });
    if (!tmpl) throw new NotFoundException({ code: 'SHIFT_TEMPLATE_NOT_FOUND' });
    assertSiteInScope(scope, tmpl.siteId);
    return tmpl;
  }

  async update(scope: OrgScope, id: string, patch: Partial<Omit<ShiftTemplateInput, 'siteId'>>): Promise<ShiftTemplate> {
    const existing = await this.findById(scope, id);
    return this.prisma.shiftTemplate.update({
      where: { id: existing.id },
      data: {
        name: patch.name,
        startTime: patch.startTime ? timeOfDay(patch.startTime) : undefined,
        endTime: patch.endTime ? timeOfDay(patch.endTime) : undefined,
        breakStartTime: patch.breakStartTime ? timeOfDay(patch.breakStartTime) : undefined,
        breakEndTime: patch.breakEndTime ? timeOfDay(patch.breakEndTime) : undefined,
        crossesMidnight: patch.crossesMidnight,
        applicableWeekdays: patch.applicableWeekdays,
        flexibleWorkType: patch.flexibleWorkType === undefined ? undefined : patch.flexibleWorkType,
      },
    });
  }

  async remove(scope: OrgScope, id: string): Promise<void> {
    const existing = await this.findById(scope, id);
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const blocking = await this.prisma.schedule.findMany({
      where: { shiftTemplateId: existing.id, workDate: { gte: today } },
      select: { id: true },
      take: 50,
    });
    if (blocking.length > 0) throw new ShiftTemplateInUseError(blocking.map((b) => b.id));
    await this.prisma.shiftTemplate.delete({ where: { id: existing.id } });
  }
}

/** 표시용 — HH:mm 문자열로 변환. */
export function shiftTemplateTimesAsStrings(t: Pick<ShiftTemplate, 'startTime' | 'endTime' | 'breakStartTime' | 'breakEndTime'>) {
  return {
    startTime: formatTimeOfDay(t.startTime),
    endTime: formatTimeOfDay(t.endTime),
    breakStartTime: t.breakStartTime ? formatTimeOfDay(t.breakStartTime) : null,
    breakEndTime: t.breakEndTime ? formatTimeOfDay(t.breakEndTime) : null,
  };
}
