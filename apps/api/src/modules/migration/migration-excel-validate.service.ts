import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ParsedWorkbook,
  ResolvedAttendanceDailyRow,
  ResolvedAttendanceMonthlyRow,
  ResolvedLeaveBalanceRow,
  ResolvedMigrationPayload,
  ResolvedPromotionLogRow,
  ResolvedReconciliationRow,
  ResolvedScheduleRow,
  ResolvedShiftTemplateRow,
  MIGRATION_SHEET_NAMES,
  RowError,
} from './migration-excel.types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_RE = /^\d{4}-\d{2}$/;
const PROMOTION_METHODS = ['WRITTEN_PAPER', 'ELECTRONIC_DOCUMENT'];
const RECONCILIATION_METRICS = ['ANNUAL_LEAVE_REMAINING_DAYS', 'ATTENDANCE_MONTHLY_ACTUAL_MINUTES'];

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  return !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`));
}

function isValidYearMonth(s: string): boolean {
  if (!YEAR_MONTH_RE.test(s)) return false;
  const [, m] = s.split('-');
  return Number(m) >= 1 && Number(m) <= 12;
}

export interface ValidationResult {
  rowErrors: RowError[];
  resolved: ResolvedMigrationPayload | null;
}

/**
 * ParsedWorkbook + DB → 행단위 오류(dry-run 결과) 또는 해석된 페이로드.
 * schedule-excel.service.ts#validate와 같은 원칙 — 오류가 하나라도 있으면
 * 아무것도 반환하지 않는다(적재는 이 단계에서 절대 일어나지 않는다).
 */
@Injectable()
export class MigrationExcelValidateService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(siteId: string, cutoverDate: string, parsed: ParsedWorkbook): Promise<ValidationResult> {
    const rowErrors: RowError[] = [];

    const employees = await this.prisma.employee.findMany({ where: { siteAssignments: { some: { siteId } } } });
    const employeeByNo = new Map(employees.map((e) => [e.employeeNo, e]));

    const leaveTypes = await this.prisma.leaveType.findMany();
    const leaveTypeByCode = new Map(leaveTypes.map((lt) => [lt.code, lt]));

    const existingTemplates = await this.prisma.shiftTemplate.findMany({ where: { siteId }, select: { name: true } });

    const leaveBalance = this.validateLeaveBalance(parsed, employeeByNo, leaveTypeByCode, rowErrors);
    const annualCountByNo = new Map<string, number>();
    for (const row of leaveBalance) {
      if (row.leaveCategory === 'ANNUAL') annualCountByNo.set(row.employeeNo, (annualCountByNo.get(row.employeeNo) ?? 0) + 1);
    }

    const promotionLog = this.validatePromotionLog(parsed, employeeByNo, annualCountByNo, leaveBalance, rowErrors);
    const { attendanceMonthly, monthlyKeysByEmployee } = this.validateAttendanceMonthly(parsed, employeeByNo, cutoverDate, rowErrors);
    const attendanceDaily = this.validateAttendanceDaily(parsed, employeeByNo, monthlyKeysByEmployee, rowErrors);
    const shiftTemplate = this.validateShiftTemplate(parsed, rowErrors);
    const templateNames = new Set([...existingTemplates.map((t) => t.name), ...shiftTemplate.map((t) => t.name)]);
    const schedule = this.validateSchedule(parsed, employeeByNo, templateNames, cutoverDate, rowErrors);
    const reconciliation = this.validateReconciliation(parsed, employeeByNo, rowErrors);

    if (rowErrors.length > 0) return { rowErrors, resolved: null };

    return {
      rowErrors: [],
      resolved: { siteId, cutoverDate, leaveBalance, promotionLog, attendanceMonthly, attendanceDaily, shiftTemplate, schedule, reconciliation },
    };
  }

  private validateLeaveBalance(
    parsed: ParsedWorkbook,
    employeeByNo: Map<string, { id: string }>,
    leaveTypeByCode: Map<string, { id: string; category: string }>,
    rowErrors: RowError[],
  ): ResolvedLeaveBalanceRow[] {
    const sheet = MIGRATION_SHEET_NAMES.LEAVE_BALANCE;
    const resolved: ResolvedLeaveBalanceRow[] = [];
    for (const row of parsed.leaveBalance) {
      const employee = employeeByNo.get(row.employeeNo);
      if (!employee) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `사번(${row.employeeNo})을 이 사업장에서 찾을 수 없습니다.` });
        continue;
      }
      const leaveType = leaveTypeByCode.get(row.leaveTypeCode);
      if (!leaveType) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `휴가유형코드(${row.leaveTypeCode})를 찾을 수 없습니다.` });
        continue;
      }
      if (!isValidDate(row.effectiveDate) || !isValidDate(row.expiryDate)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '발생일/만료일은 YYYY-MM-DD 형식이어야 합니다.' });
        continue;
      }
      if (row.effectiveDate > row.expiryDate) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '발생일이 만료일보다 늦습니다.' });
        continue;
      }
      if (row.grantedDays < 0 || row.usedDays < 0 || row.carriedOverDays < 0 || row.expiredDays < 0) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '발생/사용/이월/소멸일수는 음수일 수 없습니다.' });
        continue;
      }
      if (row.usedDays > row.grantedDays + row.carriedOverDays) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '사용일수가 발생일수+이월일수를 초과합니다(잔여일수가 음수가 됩니다).' });
        continue;
      }
      if (!row.referencePeriod) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '기준기간이 비어 있습니다.' });
        continue;
      }
      resolved.push({
        employeeId: employee.id,
        employeeNo: row.employeeNo,
        leaveTypeId: leaveType.id,
        leaveCategory: leaveType.category,
        referencePeriod: row.referencePeriod,
        effectiveDate: row.effectiveDate,
        expiryDate: row.expiryDate,
        grantedDays: row.grantedDays,
        usedDays: row.usedDays,
        carriedOverDays: row.carriedOverDays,
        expiredDays: row.expiredDays,
        note: row.note,
      });
    }
    return resolved;
  }

  private validatePromotionLog(
    parsed: ParsedWorkbook,
    employeeByNo: Map<string, { id: string }>,
    annualCountByNo: Map<string, number>,
    leaveBalance: ResolvedLeaveBalanceRow[],
    rowErrors: RowError[],
  ): ResolvedPromotionLogRow[] {
    const sheet = MIGRATION_SHEET_NAMES.PROMOTION_LOG;
    const resolved: ResolvedPromotionLogRow[] = [];
    for (const row of parsed.promotionLog) {
      const employee = employeeByNo.get(row.employeeNo);
      if (!employee) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `사번(${row.employeeNo})을 이 사업장에서 찾을 수 없습니다.` });
        continue;
      }
      const annualCount = annualCountByNo.get(row.employeeNo) ?? 0;
      if (annualCount !== 1) {
        rowErrors.push({
          sheet,
          rowNumber: row.rowNumber,
          employeeNo: row.employeeNo,
          message: `연차촉진이력을 연결하려면 연차잔액 시트에 이 사번의 ANNUAL 잔액이 정확히 1건 있어야 합니다(현재 ${annualCount}건).`,
        });
        continue;
      }
      if (row.step !== 'FIRST_NOTICE' && row.step !== 'SECOND_NOTICE') {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `단계(${row.step})는 FIRST_NOTICE 또는 SECOND_NOTICE여야 합니다.` });
        continue;
      }
      if (!PROMOTION_METHODS.includes(row.method)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `통지방법(${row.method})이 유효하지 않습니다.` });
        continue;
      }
      if (!isValidDate(row.noticeDate) || !isValidDate(row.dueDate)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '통지일/기한일은 YYYY-MM-DD 형식이어야 합니다.' });
        continue;
      }
      if (row.dueDate < row.noticeDate) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '기한일이 통지일보다 이릅니다.' });
        continue;
      }
      resolved.push({
        employeeId: employee.id,
        step: row.step as 'FIRST_NOTICE' | 'SECOND_NOTICE',
        noticeDate: row.noticeDate,
        dueDate: row.dueDate,
        method: row.method as 'WRITTEN_PAPER' | 'ELECTRONIC_DOCUMENT',
        sentAt: row.sentAt || null,
        receivedAt: row.receivedAt || null,
        requirementMet: row.requirementMet.trim().toUpperCase() === 'Y',
        responseContent: row.responseContent || null,
      });
    }
    // leaveBalance 파라미터는 시그니처 일관성을 위해 받지만 이 함수 안에서는
    // annualCountByNo로 이미 충분해 직접 참조하지 않는다.
    void leaveBalance;
    return resolved;
  }

  private validateAttendanceMonthly(
    parsed: ParsedWorkbook,
    employeeByNo: Map<string, { id: string }>,
    cutoverDate: string,
    rowErrors: RowError[],
  ): { attendanceMonthly: ResolvedAttendanceMonthlyRow[]; monthlyKeysByEmployee: Set<string> } {
    const sheet = MIGRATION_SHEET_NAMES.ATTENDANCE_MONTHLY;
    const resolved: ResolvedAttendanceMonthlyRow[] = [];
    const monthlyKeysByEmployee = new Set<string>();
    const cutoverYearMonth = cutoverDate.slice(0, 7);
    for (const row of parsed.attendanceMonthly) {
      const employee = employeeByNo.get(row.employeeNo);
      if (!employee) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `사번(${row.employeeNo})을 이 사업장에서 찾을 수 없습니다.` });
        continue;
      }
      if (!isValidYearMonth(row.yearMonth)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '귀속월은 YYYY-MM 형식이어야 합니다.' });
        continue;
      }
      if (row.yearMonth >= cutoverYearMonth) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `귀속월(${row.yearMonth})은 개통 기준일(${cutoverDate})보다 이전(과거)이어야 합니다.` });
        continue;
      }
      const minuteFields = [
        row.scheduledWorkMinutes,
        row.actualWorkMinutes,
        row.approvedOvertimeMinutes,
        row.unapprovedOvertimeMinutes,
        row.nightWorkMinutes,
        row.holidayWorkMinutesNormal,
        row.holidayWorkMinutesExcess,
        row.paidLeaveMinutes,
        row.absenceDays,
      ];
      if (minuteFields.some((v) => v < 0 || !Number.isFinite(v))) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '분/일수 필드는 0 이상의 숫자여야 합니다.' });
        continue;
      }
      resolved.push({
        employeeId: employee.id,
        yearMonth: row.yearMonth,
        totals: {
          scheduledWorkMinutes: row.scheduledWorkMinutes,
          actualWorkMinutes: row.actualWorkMinutes,
          approvedOvertimeMinutes: row.approvedOvertimeMinutes,
          unapprovedOvertimeMinutes: row.unapprovedOvertimeMinutes,
          nightWorkMinutes: row.nightWorkMinutes,
          holidayWorkMinutesNormal: row.holidayWorkMinutesNormal,
          holidayWorkMinutesExcess: row.holidayWorkMinutesExcess,
          paidLeaveMinutes: row.paidLeaveMinutes,
          absenceDays: row.absenceDays,
        },
      });
      monthlyKeysByEmployee.add(`${row.employeeNo}|${row.yearMonth}`);
    }
    return { attendanceMonthly: resolved, monthlyKeysByEmployee };
  }

  private validateAttendanceDaily(
    parsed: ParsedWorkbook,
    employeeByNo: Map<string, { id: string; primarySiteId: string }>,
    monthlyKeysByEmployee: Set<string>,
    rowErrors: RowError[],
  ): ResolvedAttendanceDailyRow[] {
    const sheet = MIGRATION_SHEET_NAMES.ATTENDANCE_DAILY;
    const resolved: ResolvedAttendanceDailyRow[] = [];
    for (const row of parsed.attendanceDaily) {
      const employee = employeeByNo.get(row.employeeNo);
      if (!employee) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `사번(${row.employeeNo})을 이 사업장에서 찾을 수 없습니다.` });
        continue;
      }
      if (!isValidDate(row.workDate)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '근무일은 YYYY-MM-DD 형식이어야 합니다.' });
        continue;
      }
      const yearMonth = row.workDate.slice(0, 7);
      if (!monthlyKeysByEmployee.has(`${row.employeeNo}|${yearMonth}`)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `근무일(${row.workDate})에 대응하는 마감월집계(${yearMonth}) 행이 없습니다.` });
        continue;
      }
      const minuteFields = [
        row.scheduledWorkMinutes,
        row.actualWorkMinutes,
        row.approvedOvertimeMinutes,
        row.unapprovedOvertimeMinutes,
        row.nightWorkMinutes,
        row.holidayWorkMinutesNormal,
        row.holidayWorkMinutesExcess,
        row.paidLeaveMinutes,
      ];
      if (minuteFields.some((v) => v < 0 || !Number.isFinite(v))) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '분 필드는 0 이상의 숫자여야 합니다.' });
        continue;
      }
      resolved.push({
        employeeId: employee.id,
        siteId: employee.primarySiteId,
        workDate: row.workDate,
        scheduledWorkMinutes: row.scheduledWorkMinutes,
        actualWorkMinutes: row.actualWorkMinutes,
        approvedOvertimeMinutes: row.approvedOvertimeMinutes,
        unapprovedOvertimeMinutes: row.unapprovedOvertimeMinutes,
        nightWorkMinutes: row.nightWorkMinutes,
        holidayWorkMinutesNormal: row.holidayWorkMinutesNormal,
        holidayWorkMinutesExcess: row.holidayWorkMinutesExcess,
        paidLeaveMinutes: row.paidLeaveMinutes,
        isAbsence: row.isAbsence.trim().toUpperCase() === 'Y',
      });
    }
    return resolved;
  }

  private validateShiftTemplate(parsed: ParsedWorkbook, rowErrors: RowError[]): ResolvedShiftTemplateRow[] {
    const sheet = MIGRATION_SHEET_NAMES.SHIFT_TEMPLATE;
    const resolved: ResolvedShiftTemplateRow[] = [];
    const seenNames = new Set<string>();
    const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/;
    for (const row of parsed.shiftTemplate) {
      if (seenNames.has(row.name)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, message: `교대패턴명(${row.name})이 시트 안에서 중복됩니다.` });
        continue;
      }
      if (!timeRe.test(row.startTime) || !timeRe.test(row.endTime)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, message: '시작/종료 시각은 HH:mm 형식이어야 합니다.' });
        continue;
      }
      const weekdays = row.applicableWeekdays
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map(Number);
      if (weekdays.length === 0 || weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, message: '적용요일은 1~7 사이 숫자를 콤마로 구분해야 합니다.' });
        continue;
      }
      seenNames.add(row.name);
      resolved.push({
        name: row.name,
        startTime: row.startTime,
        endTime: row.endTime,
        breakStartTime: row.breakStartTime || null,
        breakEndTime: row.breakEndTime || null,
        crossesMidnight: row.crossesMidnight.trim().toUpperCase() === 'Y',
        applicableWeekdays: weekdays,
      });
    }
    return resolved;
  }

  private validateSchedule(
    parsed: ParsedWorkbook,
    employeeByNo: Map<string, { id: string }>,
    templateNames: Set<string>,
    cutoverDate: string,
    rowErrors: RowError[],
  ): ResolvedScheduleRow[] {
    const sheet = MIGRATION_SHEET_NAMES.SCHEDULE;
    const resolved: ResolvedScheduleRow[] = [];
    for (const row of parsed.schedule) {
      const employee = employeeByNo.get(row.employeeNo);
      if (!employee) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `사번(${row.employeeNo})을 이 사업장에서 찾을 수 없습니다.` });
        continue;
      }
      if (!isValidDate(row.workDate)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '근무일은 YYYY-MM-DD 형식이어야 합니다.' });
        continue;
      }
      if (row.workDate < cutoverDate) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `근무일(${row.workDate})은 개통 기준일(${cutoverDate}) 이후여야 합니다(확정 스케줄은 향후분만 이관합니다).` });
        continue;
      }
      if (!templateNames.has(row.shiftTemplateName)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `교대패턴(${row.shiftTemplateName})을 찾을 수 없습니다.` });
        continue;
      }
      if (row.breakMinutes < 0) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '휴게(분)은 음수일 수 없습니다.' });
        continue;
      }
      resolved.push({ employeeId: employee.id, workDate: row.workDate, shiftTemplateName: row.shiftTemplateName, breakMinutes: row.breakMinutes });
    }
    return resolved;
  }

  private validateReconciliation(parsed: ParsedWorkbook, employeeByNo: Map<string, { id: string }>, rowErrors: RowError[]): ResolvedReconciliationRow[] {
    const sheet = MIGRATION_SHEET_NAMES.RECONCILIATION;
    const resolved: ResolvedReconciliationRow[] = [];
    for (const row of parsed.reconciliation) {
      const employee = employeeByNo.get(row.employeeNo);
      if (!employee) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `사번(${row.employeeNo})을 이 사업장에서 찾을 수 없습니다.` });
        continue;
      }
      if (!RECONCILIATION_METRICS.includes(row.metric)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: `항목(${row.metric})이 유효하지 않습니다. ${RECONCILIATION_METRICS.join('/')} 중 하나여야 합니다.` });
        continue;
      }
      if (!Number.isFinite(row.manualValue)) {
        rowErrors.push({ sheet, rowNumber: row.rowNumber, employeeNo: row.employeeNo, message: '수기값은 숫자여야 합니다.' });
        continue;
      }
      resolved.push({ employeeId: employee.id, metric: row.metric as ResolvedReconciliationRow['metric'], manualValue: row.manualValue });
    }
    return resolved;
  }
}
