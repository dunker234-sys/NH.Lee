import { BadRequestException, Injectable } from '@nestjs/common';
import { Schedule } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { GenerateRosterDto } from './dto/generate-roster.dto';
import { ScheduleHardBlockError } from './errors/schedule-errors';
import { ScheduleRepository } from './schedule.repository';
import { ScheduleValidationService, ScheduleValidationTarget } from './schedule-validation.service';
import { addDays, daysBetween, formatTimeOfDay, kstWallTimeToInstant, positiveMod } from './schedule-date.util';

interface ExpandedRow {
  employeeId: string;
  siteId: string;
  workDate: string;
  shiftTemplateId: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  plannedBreakMinutes: number;
}

/**
 * 반복 규칙(§1의 GenerateRosterDto)을 구체 Schedule 행으로 펼친 뒤
 * createManyAndReturn 1회로 삽입한다(30명×30일/3초 예산, §3.4). 저장 전
 * hard-block 검증을 통과해야 한다 — 위반이 있으면 아무 행도 삽입하지
 * 않는다(전부-아니면-없음).
 */
@Injectable()
export class RosterGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ScheduleRepository,
    private readonly validation: ScheduleValidationService,
  ) {}

  async generate(scope: OrgScope, dto: GenerateRosterDto): Promise<{ created: number; rows: Schedule[] }> {
    assertScope(scope);
    assertSiteInScope(scope, dto.siteId);

    const templateIds = new Set<string>();
    for (const a of dto.assignments) {
      if (a.pattern.length !== a.cycleLengthDays) {
        throw new BadRequestException({
          code: 'ROSTER_PATTERN_LENGTH_MISMATCH',
          message: `직원(${a.employeeId})의 pattern 길이(${a.pattern.length})가 cycleLengthDays(${a.cycleLengthDays})와 다릅니다.`,
        });
      }
      for (const p of a.pattern) if (p) templateIds.add(p);
    }

    const templates = await this.prisma.shiftTemplate.findMany({ where: { id: { in: [...templateIds] }, siteId: dto.siteId } });
    const templateById = new Map(templates.map((t) => [t.id, t]));
    const missing = [...templateIds].filter((id) => !templateById.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({ code: 'ROSTER_UNKNOWN_SHIFT_TEMPLATE', message: `알 수 없는 교대 패턴 id: ${missing.join(', ')}` });
    }

    const rows: ExpandedRow[] = [];
    for (const a of dto.assignments) {
      for (let d = dto.startDate; d <= dto.endDate; d = addDays(d, 1)) {
        const offset = positiveMod(daysBetween(a.anchorDate, d), a.cycleLengthDays);
        const templateId = a.pattern[offset];
        if (!templateId) continue;
        const template = templateById.get(templateId)!;

        const plannedStartAt = kstWallTimeToInstant(d, formatTimeOfDay(template.startTime));
        const endDateStr = template.crossesMidnight ? addDays(d, 1) : d;
        const plannedEndAt = kstWallTimeToInstant(endDateStr, formatTimeOfDay(template.endTime));

        let plannedBreakMinutes = 0;
        if (template.breakStartTime && template.breakEndTime) {
          const breakStartMin = template.breakStartTime.getUTCHours() * 60 + template.breakStartTime.getUTCMinutes();
          const breakEndMin = template.breakEndTime.getUTCHours() * 60 + template.breakEndTime.getUTCMinutes();
          plannedBreakMinutes = Math.max(0, breakEndMin - breakStartMin);
        }

        rows.push({
          employeeId: a.employeeId,
          siteId: dto.siteId,
          workDate: d,
          shiftTemplateId: templateId,
          plannedStartAt,
          plannedEndAt,
          plannedBreakMinutes,
        });
      }
    }

    const targets: ScheduleValidationTarget[] = rows.map((r, i) => ({
      id: `pending:${i}`,
      employeeId: r.employeeId,
      siteId: r.siteId,
      shiftTemplateId: r.shiftTemplateId,
      plannedStartAt: r.plannedStartAt,
      plannedEndAt: r.plannedEndAt,
      plannedBreakMinutes: r.plannedBreakMinutes,
    }));
    const { hardBlocks } = await this.validation.validate(targets, { skipSoftWarnings: true });
    if (hardBlocks.length > 0) throw new ScheduleHardBlockError(hardBlocks);

    const created = await this.repo.generateRoster(rows);
    return { created: created.length, rows: created };
  }
}
