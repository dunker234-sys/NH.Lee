import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { canonicalJson, sha256 } from '../../common/crypto/hash.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly } from '../../common/time/week.util';
import { addDays, formatTimeOfDay, kstWallTimeToInstant } from '../schedule/schedule-date.util';
import { MigrationExcelParseService } from './migration-excel-parse.service';
import { MigrationExcelValidateService } from './migration-excel-validate.service';
import { ResolvedMigrationPayload, RowError } from './migration-excel.types';
import { MigrationCommitTokenInvalidError } from './errors/migration-errors';
import { SiteCutoverService } from './site-cutover.service';

interface PendingMigrationCommit {
  payload: ResolvedMigrationPayload;
  expiresAt: number;
}

export interface MigrationValidateResult {
  rowErrors: RowError[];
  commitToken: string | null;
}

export interface MigrationCommitResult {
  leaveBalanceRows: number;
  promotionLogRows: number;
  attendanceMonthlyRows: number;
  attendanceDailyRows: number;
  shiftTemplateRows: number;
  scheduleRows: number;
  reconciliation: { ready: boolean; totalRecords: number; unresolvedCount: number };
}

/**
 * 개시 데이터 이관 — validate(dry-run) → commitToken → commit 2단계.
 * schedule-excel.service.ts와 동일 원칙: 파싱·검증은 서버에서만, commitToken은
 * 이 서비스 인스턴스 메모리에만(단일 인스턴스 배포 전제, 알려진 한계) 60분
 * TTL로 보관한다 — 이관 데이터량이 스케줄 한 달치보다 많아 검토 시간을
 * 넉넉히 둔다.
 */
@Injectable()
export class MigrationImportService {
  private readonly pending = new Map<string, PendingMigrationCommit>();
  private static readonly TOKEN_TTL_MS = 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: MigrationExcelParseService,
    private readonly validator: MigrationExcelValidateService,
    private readonly siteCutoverService: SiteCutoverService,
    private readonly auditLog: AuditLogService,
  ) {}

  async validate(scope: OrgScope, siteId: string, fileBuffer: Buffer): Promise<MigrationValidateResult> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);

    const cutover = await this.siteCutoverService.getOrThrow(siteId);
    const cutoverDateStr = cutover.cutoverDate.toISOString().slice(0, 10);

    const parsed = await this.parser.parse(fileBuffer);
    const { rowErrors, resolved } = await this.validator.validate(siteId, cutoverDateStr, parsed);
    if (rowErrors.length > 0 || !resolved) return { rowErrors, commitToken: null };

    const commitToken = randomUUID();
    this.pending.set(commitToken, { payload: resolved, expiresAt: Date.now() + MigrationImportService.TOKEN_TTL_MS });
    return { rowErrors: [], commitToken };
  }

  async commit(scope: OrgScope, principal: EmployeePrincipal, commitToken: string): Promise<MigrationCommitResult> {
    assertScope(scope);
    const pending = this.pending.get(commitToken);
    if (!pending || pending.expiresAt < Date.now()) {
      this.pending.delete(commitToken);
      throw new MigrationCommitTokenInvalidError();
    }
    assertSiteInScope(scope, pending.payload.siteId);

    const payload = pending.payload;
    const counts = await this.prisma.$transaction(
      async (tx) => {
        // 1. 연차잔액
        const leaveBalanceIdByEmployeeId = new Map<string, string>();
        for (const row of payload.leaveBalance) {
          const balance = await tx.leaveBalance.upsert({
            where: { employeeId_leaveTypeId_referencePeriod: { employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, referencePeriod: row.referencePeriod } },
            create: {
              employeeId: row.employeeId,
              leaveTypeId: row.leaveTypeId,
              referencePeriod: row.referencePeriod,
              effectiveDate: dateOnly(row.effectiveDate),
              expiryDate: dateOnly(row.expiryDate),
              grantedDays: row.grantedDays,
              usedDays: row.usedDays,
              carriedOverDays: row.carriedOverDays,
              expiredDays: row.expiredDays,
              source: 'MIGRATION',
              basis: { reasonCode: 'MIGRATED', note: row.note, importedAt: new Date().toISOString() },
            },
            update: {
              effectiveDate: dateOnly(row.effectiveDate),
              expiryDate: dateOnly(row.expiryDate),
              grantedDays: row.grantedDays,
              usedDays: row.usedDays,
              carriedOverDays: row.carriedOverDays,
              expiredDays: row.expiredDays,
              source: 'MIGRATION',
              basis: { reasonCode: 'MIGRATED', note: row.note, importedAt: new Date().toISOString() },
            },
          });
          if (row.leaveCategory === 'ANNUAL') leaveBalanceIdByEmployeeId.set(row.employeeId, balance.id);
        }

        // 2. 연차촉진이력 — 이 배치가 다루는 LeaveBalance 범위를 통째로 교체한다
        // (자연키가 없는 테이블이라 재커밋 시 중복 방지 전략).
        const promotionTargetBalanceIds = [...leaveBalanceIdByEmployeeId.values()];
        if (promotionTargetBalanceIds.length > 0) {
          await tx.leavePromotionLog.deleteMany({ where: { leaveBalanceId: { in: promotionTargetBalanceIds } } });
        }
        let promotionLogRows = 0;
        for (const row of payload.promotionLog) {
          const leaveBalanceId = leaveBalanceIdByEmployeeId.get(row.employeeId);
          if (!leaveBalanceId) continue; // validate()가 이미 걸렀어야 하지만 방어적으로 skip
          await tx.leavePromotionLog.create({
            data: {
              leaveBalanceId,
              procedureType: 'ARTICLE_61_1',
              wave: null,
              step: row.step,
              noticeDate: dateOnly(row.noticeDate),
              dueDate: dateOnly(row.dueDate),
              method: row.method,
              sentAt: row.sentAt ? new Date(row.sentAt) : null,
              receivedAt: row.receivedAt ? new Date(row.receivedAt) : null,
              requirementMet: row.requirementMet,
              responseContent: row.responseContent,
            },
          });
          promotionLogRows += 1;
        }

        // 3. 마감월집계 + 대응 PayrollClose(CLOSED) — assertPayrollOpen()이
        // 이 CLOSED 상태를 근거로 재계산 자체를 막아준다(핵심 보호 장치).
        for (const row of payload.attendanceMonthly) {
          await tx.attendanceMonthly.upsert({
            where: { employeeId_yearMonth: { employeeId: row.employeeId, yearMonth: row.yearMonth } },
            create: { employeeId: row.employeeId, yearMonth: row.yearMonth, totals: row.totals as unknown as Prisma.InputJsonValue, source: 'MIGRATION' },
            update: { totals: row.totals as unknown as Prisma.InputJsonValue, source: 'MIGRATION' },
          });
          await tx.payrollClose.upsert({
            where: { siteId_periodYearMonth: { siteId: payload.siteId, periodYearMonth: row.yearMonth } },
            create: { siteId: payload.siteId, periodYearMonth: row.yearMonth, status: 'CLOSED', closedAt: new Date(), closedBy: principal.employeeId },
            update: { status: 'CLOSED', closedAt: new Date(), closedBy: principal.employeeId },
          });
        }

        // 4. 마감월일별상세(있는 행만)
        let attendanceDailyRows = 0;
        for (const row of payload.attendanceDaily) {
          const inputSnapshotHash = sha256(canonicalJson({ ...row, source: 'MIGRATION' }));
          await tx.attendanceDaily.upsert({
            where: { employeeId_workDate: { employeeId: row.employeeId, workDate: dateOnly(row.workDate) } },
            create: {
              employeeId: row.employeeId,
              siteId: row.siteId,
              workDate: dateOnly(row.workDate),
              scheduledWorkMinutes: row.scheduledWorkMinutes,
              actualWorkMinutes: row.actualWorkMinutes,
              approvedOvertimeMinutes: row.approvedOvertimeMinutes,
              unapprovedOvertimeMinutes: row.unapprovedOvertimeMinutes,
              nightWorkMinutes: row.nightWorkMinutes,
              holidayWorkMinutesNormal: row.holidayWorkMinutesNormal,
              holidayWorkMinutesExcess: row.holidayWorkMinutesExcess,
              paidLeaveMinutes: row.paidLeaveMinutes,
              isAbsence: row.isAbsence,
              status: 'LOCKED',
              source: 'MIGRATION',
              inputSnapshotHash,
              breakdown: { reasonCode: 'MIGRATED', importedAt: new Date().toISOString() },
            },
            update: {
              siteId: row.siteId,
              scheduledWorkMinutes: row.scheduledWorkMinutes,
              actualWorkMinutes: row.actualWorkMinutes,
              approvedOvertimeMinutes: row.approvedOvertimeMinutes,
              unapprovedOvertimeMinutes: row.unapprovedOvertimeMinutes,
              nightWorkMinutes: row.nightWorkMinutes,
              holidayWorkMinutesNormal: row.holidayWorkMinutesNormal,
              holidayWorkMinutesExcess: row.holidayWorkMinutesExcess,
              paidLeaveMinutes: row.paidLeaveMinutes,
              isAbsence: row.isAbsence,
              status: 'LOCKED',
              source: 'MIGRATION',
              inputSnapshotHash,
              breakdown: { reasonCode: 'MIGRATED', importedAt: new Date().toISOString() },
            },
          });
          attendanceDailyRows += 1;
        }

        // 5. 교대패턴
        let shiftTemplateRows = 0;
        for (const row of payload.shiftTemplate) {
          const existing = await tx.shiftTemplate.findFirst({ where: { siteId: payload.siteId, name: row.name } });
          if (existing) continue;
          await tx.shiftTemplate.create({
            data: {
              siteId: payload.siteId,
              name: row.name,
              startTime: timeOfDay(row.startTime),
              endTime: timeOfDay(row.endTime),
              breakStartTime: row.breakStartTime ? timeOfDay(row.breakStartTime) : null,
              breakEndTime: row.breakEndTime ? timeOfDay(row.breakEndTime) : null,
              crossesMidnight: row.crossesMidnight,
              applicableWeekdays: row.applicableWeekdays,
            },
          });
          shiftTemplateRows += 1;
        }

        // 6. 확정스케줄
        const templates = await tx.shiftTemplate.findMany({ where: { siteId: payload.siteId } });
        const templateByName = new Map(templates.map((t) => [t.name, t]));
        let scheduleRows = 0;
        for (const row of payload.schedule) {
          const template = templateByName.get(row.shiftTemplateName);
          if (!template) continue; // validate()가 이미 걸렀어야 하지만 방어적으로 skip
          const plannedStartAt = kstWallTimeToInstant(row.workDate, formatTimeOfDay(template.startTime));
          const endDateStr = template.crossesMidnight ? addDays(row.workDate, 1) : row.workDate;
          const plannedEndAt = kstWallTimeToInstant(endDateStr, formatTimeOfDay(template.endTime));

          const existing = await tx.schedule.findFirst({ where: { employeeId: row.employeeId, siteId: payload.siteId, workDate: dateOnly(row.workDate) } });
          if (existing) {
            await tx.schedule.update({
              where: { id: existing.id },
              data: { shiftTemplateId: template.id, plannedStartAt, plannedEndAt, plannedBreakMinutes: row.breakMinutes, status: 'CONFIRMED', version: { increment: 1 } },
            });
          } else {
            await tx.schedule.create({
              data: {
                employeeId: row.employeeId,
                siteId: payload.siteId,
                workDate: dateOnly(row.workDate),
                shiftTemplateId: template.id,
                plannedStartAt,
                plannedEndAt,
                plannedBreakMinutes: row.breakMinutes,
                status: 'CONFIRMED',
              },
            });
          }
          scheduleRows += 1;
        }

        // 7. 수기집계대사 — 이 사업장의 기존 기록을 통째로 교체한다.
        const cutover = await tx.siteCutover.findUniqueOrThrow({ where: { siteId: payload.siteId } });
        await tx.migrationReconciliationRecord.deleteMany({ where: { siteId: payload.siteId } });
        for (const row of payload.reconciliation) {
          const migratedValue = await this.computeMigratedValue(tx, row.employeeId, row.metric);
          const diff = round2(row.manualValue - migratedValue);
          await tx.migrationReconciliationRecord.create({
            data: {
              siteCutoverId: cutover.id,
              siteId: payload.siteId,
              employeeId: row.employeeId,
              metric: row.metric,
              manualValue: row.manualValue,
              migratedValue,
              diff,
            },
          });
        }

        return {
          leaveBalanceRows: payload.leaveBalance.length,
          promotionLogRows,
          attendanceMonthlyRows: payload.attendanceMonthly.length,
          attendanceDailyRows,
          shiftTemplateRows,
          scheduleRows,
        };
      },
      { timeout: 30000 },
    );

    this.pending.delete(commitToken);

    await this.auditLog.write({
      actorPrincipal: principal.employeeNo,
      actorRole: principal.role,
      eventType: 'MIGRATION_COMMIT',
      resourceType: 'site',
      resourceId: payload.siteId,
      afterValue: counts,
    });

    const reconciliation = await this.computeReadinessSnapshot(payload.siteId);
    return { ...counts, reconciliation };
  }

  private async computeMigratedValue(
    tx: Prisma.TransactionClient,
    employeeId: string,
    metric: 'ANNUAL_LEAVE_REMAINING_DAYS' | 'ATTENDANCE_MONTHLY_ACTUAL_MINUTES',
  ): Promise<number> {
    if (metric === 'ANNUAL_LEAVE_REMAINING_DAYS') {
      const balances = await tx.leaveBalance.findMany({
        where: { employeeId, source: 'MIGRATION', leaveType: { category: 'ANNUAL' } },
      });
      return round2(
        balances.reduce((sum, b) => sum + b.grantedDays.toNumber() + b.carriedOverDays.toNumber() - b.usedDays.toNumber() - b.expiredDays.toNumber(), 0),
      );
    }
    const monthlies = await tx.attendanceMonthly.findMany({ where: { employeeId, source: 'MIGRATION' } });
    return round2(monthlies.reduce((sum, m) => sum + ((m.totals as { actualWorkMinutes?: number })?.actualWorkMinutes ?? 0), 0));
  }

  private async computeReadinessSnapshot(siteId: string): Promise<{ ready: boolean; totalRecords: number; unresolvedCount: number }> {
    const [totalRecords, unresolvedCount] = await Promise.all([
      this.prisma.migrationReconciliationRecord.count({ where: { siteId } }),
      this.prisma.migrationReconciliationRecord.count({ where: { siteId, diff: { not: 0 } } }),
    ]);
    return { ready: totalRecords > 0 && unresolvedCount === 0, totalRecords, unresolvedCount };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** shift-template.repository.ts#timeOfDay와 동일 — @db.Time(0) 컬럼은
 * 벽시계 시각 저장일 뿐이라 KST→UTC 인스턴트 변환(kstWallTimeToInstant)을
 * 쓰면 안 된다(그건 근무일+시각의 실제 발생 순간을 위한 함수). */
function timeOfDay(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}
