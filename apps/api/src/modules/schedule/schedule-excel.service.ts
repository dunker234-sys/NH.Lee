import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import { Schedule } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { monthRange } from '../../common/time/week.util';
import { ScheduleGridStaleError, ScheduleHardBlockError } from './errors/schedule-errors';
import { computeScheduleGridVersion } from './schedule-version.util';
import { addDays, kstWallTimeToInstant, formatTimeOfDay } from './schedule-date.util';
import { ScheduleValidationService, ScheduleValidationTarget } from './schedule-validation.service';

const HEADERS = ['사번', '근무일(YYYY-MM-DD)', '교대패턴명', '휴게(분)'] as const;

interface ParsedRow {
  rowNumber: number;
  employeeNo: string;
  workDate: string;
  shiftTemplateName: string;
  breakMinutes: number;
}

interface RowError {
  rowNumber: number;
  message: string;
}

interface PendingCommit {
  siteId: string;
  yearMonth: string;
  rows: { employeeId: string; workDate: string; shiftTemplateId: string; plannedBreakMinutes: number }[];
  gridVersionAtValidate: string;
  expiresAt: number;
}

/**
 * 엑셀 업/다운로드. 파싱·검증은 서버(apps/api)에서만 한다 — 버전 충돌
 * 판정과 검증을 한 곳에 모으고, 업로드 원본을 감사 대상으로 남기기
 * 위해서다(§5.4). commitToken은 이 서비스 인스턴스의 메모리에만
 * 보관한다 — 단일 인스턴스 배포를 전제로 한 알려진 한계(수평 확장 시
 * Redis 등 공유 저장소로 옮겨야 한다).
 */
@Injectable()
export class ScheduleExcelService {
  private readonly pending = new Map<string, PendingCommit>();
  private static readonly TOKEN_TTL_MS = 15 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: ScheduleValidationService,
  ) {}

  async downloadTemplate(scope: OrgScope, siteId: string): Promise<Buffer> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('편성');
    sheet.addRow([...HEADERS]);

    const templates = await this.prisma.shiftTemplate.findMany({ where: { siteId } });
    const refSheet = workbook.addWorksheet('교대패턴 목록(참고)');
    refSheet.addRow(['name', 'startTime', 'endTime']);
    for (const t of templates) refSheet.addRow([t.name, formatTimeOfDay(t.startTime), formatTimeOfDay(t.endTime)]);

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async validate(
    scope: OrgScope,
    siteId: string,
    yearMonth: string,
    clientGridVersion: string,
    fileBuffer: Buffer,
  ): Promise<{ rowErrors: RowError[]; conflictDiff: { currentGridVersion: string; currentRows: Schedule[] } | null; commitToken: string | null }> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);

    const { start, end } = monthRange(yearMonth);
    const currentRows = await this.prisma.schedule.findMany({ where: { siteId, workDate: { gte: start, lt: end } } });
    const currentGridVersion = computeScheduleGridVersion(currentRows);
    if (currentGridVersion !== clientGridVersion) {
      return { rowErrors: [], conflictDiff: { currentGridVersion, currentRows }, commitToken: null };
    }

    const parsed = await this.parse(fileBuffer);
    const employees = await this.prisma.employee.findMany({ where: { siteAssignments: { some: { siteId } } } });
    const employeeByNo = new Map(employees.map((e) => [e.employeeNo, e]));
    const templates = await this.prisma.shiftTemplate.findMany({ where: { siteId } });
    const templateByName = new Map(templates.map((t) => [t.name, t]));

    const rowErrors: RowError[] = [];
    const resolvedRows: { employeeId: string; workDate: string; shiftTemplateId: string; plannedBreakMinutes: number }[] = [];
    const targets: ScheduleValidationTarget[] = [];

    for (const row of parsed) {
      const employee = employeeByNo.get(row.employeeNo);
      if (!employee) {
        rowErrors.push({ rowNumber: row.rowNumber, message: `사번(${row.employeeNo})을 이 사업장에서 찾을 수 없습니다.` });
        continue;
      }
      const template = templateByName.get(row.shiftTemplateName);
      if (!template) {
        rowErrors.push({ rowNumber: row.rowNumber, message: `교대패턴(${row.shiftTemplateName})을 이 사업장에서 찾을 수 없습니다.` });
        continue;
      }
      if (row.workDate < yearMonth.concat('-01') || row.workDate >= monthRange(yearMonth).end.toISOString().slice(0, 10)) {
        rowErrors.push({ rowNumber: row.rowNumber, message: `근무일(${row.workDate})이 대상 월(${yearMonth})을 벗어났습니다.` });
        continue;
      }

      resolvedRows.push({ employeeId: employee.id, workDate: row.workDate, shiftTemplateId: template.id, plannedBreakMinutes: row.breakMinutes });

      const plannedStartAt = kstWallTimeToInstant(row.workDate, formatTimeOfDay(template.startTime));
      const endDateStr = template.crossesMidnight ? addDays(row.workDate, 1) : row.workDate;
      const plannedEndAt = kstWallTimeToInstant(endDateStr, formatTimeOfDay(template.endTime));
      targets.push({
        id: `excel-row:${row.rowNumber}`,
        employeeId: employee.id,
        siteId,
        shiftTemplateId: template.id,
        plannedStartAt,
        plannedEndAt,
        plannedBreakMinutes: row.breakMinutes,
      });
    }

    if (rowErrors.length > 0) return { rowErrors, conflictDiff: null, commitToken: null };

    const { hardBlocks } = await this.validation.validate(targets, { skipSoftWarnings: true });
    if (hardBlocks.length > 0) throw new ScheduleHardBlockError(hardBlocks);

    const commitToken = randomUUID();
    this.pending.set(commitToken, {
      siteId,
      yearMonth,
      rows: resolvedRows,
      gridVersionAtValidate: currentGridVersion,
      expiresAt: Date.now() + ScheduleExcelService.TOKEN_TTL_MS,
    });
    return { rowErrors: [], conflictDiff: null, commitToken };
  }

  async commit(scope: OrgScope, commitToken: string): Promise<{ upserted: number }> {
    assertScope(scope);
    const pending = this.pending.get(commitToken);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new BadRequestException({ code: 'EXCEL_COMMIT_TOKEN_INVALID', message: '검증 토큰이 만료되었거나 존재하지 않습니다. 다시 업로드하세요.' });
    }
    assertSiteInScope(scope, pending.siteId);

    const { start, end } = monthRange(pending.yearMonth);
    const currentRows = await this.prisma.schedule.findMany({ where: { siteId: pending.siteId, workDate: { gte: start, lt: end } } });
    const currentGridVersion = computeScheduleGridVersion(currentRows);
    if (currentGridVersion !== pending.gridVersionAtValidate) {
      this.pending.delete(commitToken);
      throw new ScheduleGridStaleError({ currentGridVersion, currentRows });
    }

    let upserted = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const row of pending.rows) {
        const workDate = new Date(`${row.workDate}T00:00:00.000Z`);
        const template = await tx.shiftTemplate.findUniqueOrThrow({ where: { id: row.shiftTemplateId } });
        const plannedStartAt = kstWallTimeToInstant(row.workDate, formatTimeOfDay(template.startTime));
        const endDateStr = template.crossesMidnight ? addDays(row.workDate, 1) : row.workDate;
        const plannedEndAt = kstWallTimeToInstant(endDateStr, formatTimeOfDay(template.endTime));

        const existing = await tx.schedule.findFirst({ where: { employeeId: row.employeeId, siteId: pending.siteId, workDate } });
        if (existing) {
          await tx.schedule.update({
            where: { id: existing.id },
            data: { shiftTemplateId: row.shiftTemplateId, plannedStartAt, plannedEndAt, plannedBreakMinutes: row.plannedBreakMinutes, version: { increment: 1 } },
          });
        } else {
          await tx.schedule.create({
            data: {
              employeeId: row.employeeId,
              siteId: pending.siteId,
              workDate,
              shiftTemplateId: row.shiftTemplateId,
              plannedStartAt,
              plannedEndAt,
              plannedBreakMinutes: row.plannedBreakMinutes,
            },
          });
        }
        upserted += 1;
      }
    });

    this.pending.delete(commitToken);
    return { upserted };
  }

  private async parse(buffer: Buffer): Promise<ParsedRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException({ code: 'EXCEL_EMPTY', message: '시트를 찾을 수 없습니다.' });

    const rows: ParsedRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // 헤더
      const employeeNo = String(row.getCell(1).value ?? '').trim();
      const workDate = String(row.getCell(2).value ?? '').trim();
      const shiftTemplateName = String(row.getCell(3).value ?? '').trim();
      const breakRaw = row.getCell(4).value;
      const breakMinutes = typeof breakRaw === 'number' ? breakRaw : Number(breakRaw ?? 0) || 0;
      if (!employeeNo && !workDate && !shiftTemplateName) return; // 빈 행 스킵
      rows.push({ rowNumber, employeeNo, workDate, shiftTemplateName, breakMinutes });
    });
    return rows;
  }
}
