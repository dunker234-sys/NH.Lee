import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { MIGRATION_SHEET_NAMES, ParsedWorkbook } from './migration-excel.types';

function str(row: ExcelJS.Row, col: number): string {
  return String(row.getCell(col).value ?? '').trim();
}

function num(row: ExcelJS.Row, col: number): number {
  const raw = row.getCell(col).value;
  return typeof raw === 'number' ? raw : Number(raw ?? 0) || 0;
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => c === '');
}

/**
 * 워크북 → ParsedWorkbook. DB 조회 없이 셀 값만 문자열/숫자로 뽑는다 —
 * schedule-excel.service.ts#parse와 동일하게 서버에서만 파싱한다. 시트가
 * 아예 없으면 그 대상은 이번 이관에서 빈 배열로 취급한다(교대패턴/스케줄/
 * 일별상세처럼 선택적인 이관 대상이 흔함).
 */
@Injectable()
export class MigrationExcelParseService {
  async parse(buffer: Buffer): Promise<ParsedWorkbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    if (workbook.worksheets.length === 0) {
      throw new BadRequestException({ code: 'MIGRATION_EXCEL_EMPTY', message: '시트를 찾을 수 없습니다.' });
    }

    return {
      leaveBalance: this.parseLeaveBalance(workbook),
      promotionLog: this.parsePromotionLog(workbook),
      attendanceMonthly: this.parseAttendanceMonthly(workbook),
      attendanceDaily: this.parseAttendanceDaily(workbook),
      shiftTemplate: this.parseShiftTemplate(workbook),
      schedule: this.parseSchedule(workbook),
      reconciliation: this.parseReconciliation(workbook),
    };
  }

  private parseLeaveBalance(workbook: ExcelJS.Workbook) {
    const sheet = workbook.getWorksheet(MIGRATION_SHEET_NAMES.LEAVE_BALANCE);
    const rows: ParsedWorkbook['leaveBalance'] = [];
    if (!sheet) return rows;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells = [str(row, 1), str(row, 2), str(row, 3), str(row, 4), str(row, 5)];
      if (isBlankRow(cells)) return;
      rows.push({
        rowNumber,
        employeeNo: cells[0],
        leaveTypeCode: cells[1],
        referencePeriod: cells[2],
        effectiveDate: cells[3],
        expiryDate: cells[4],
        grantedDays: num(row, 6),
        usedDays: num(row, 7),
        carriedOverDays: num(row, 8),
        expiredDays: num(row, 9),
        note: str(row, 10),
      });
    });
    return rows;
  }

  private parsePromotionLog(workbook: ExcelJS.Workbook) {
    const sheet = workbook.getWorksheet(MIGRATION_SHEET_NAMES.PROMOTION_LOG);
    const rows: ParsedWorkbook['promotionLog'] = [];
    if (!sheet) return rows;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const employeeNo = str(row, 1);
      const step = str(row, 2);
      if (isBlankRow([employeeNo, step])) return;
      rows.push({
        rowNumber,
        employeeNo,
        step,
        noticeDate: str(row, 3),
        dueDate: str(row, 4),
        method: str(row, 5),
        sentAt: str(row, 6),
        receivedAt: str(row, 7),
        requirementMet: str(row, 8),
        responseContent: str(row, 9),
      });
    });
    return rows;
  }

  private parseAttendanceMonthly(workbook: ExcelJS.Workbook) {
    const sheet = workbook.getWorksheet(MIGRATION_SHEET_NAMES.ATTENDANCE_MONTHLY);
    const rows: ParsedWorkbook['attendanceMonthly'] = [];
    if (!sheet) return rows;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const employeeNo = str(row, 1);
      const yearMonth = str(row, 2);
      if (isBlankRow([employeeNo, yearMonth])) return;
      rows.push({
        rowNumber,
        employeeNo,
        yearMonth,
        scheduledWorkMinutes: num(row, 3),
        actualWorkMinutes: num(row, 4),
        approvedOvertimeMinutes: num(row, 5),
        unapprovedOvertimeMinutes: num(row, 6),
        nightWorkMinutes: num(row, 7),
        holidayWorkMinutesNormal: num(row, 8),
        holidayWorkMinutesExcess: num(row, 9),
        paidLeaveMinutes: num(row, 10),
        absenceDays: num(row, 11),
      });
    });
    return rows;
  }

  private parseAttendanceDaily(workbook: ExcelJS.Workbook) {
    const sheet = workbook.getWorksheet(MIGRATION_SHEET_NAMES.ATTENDANCE_DAILY);
    const rows: ParsedWorkbook['attendanceDaily'] = [];
    if (!sheet) return rows;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const employeeNo = str(row, 1);
      const workDate = str(row, 2);
      if (isBlankRow([employeeNo, workDate])) return;
      rows.push({
        rowNumber,
        employeeNo,
        workDate,
        scheduledWorkMinutes: num(row, 3),
        actualWorkMinutes: num(row, 4),
        approvedOvertimeMinutes: num(row, 5),
        unapprovedOvertimeMinutes: num(row, 6),
        nightWorkMinutes: num(row, 7),
        holidayWorkMinutesNormal: num(row, 8),
        holidayWorkMinutesExcess: num(row, 9),
        paidLeaveMinutes: num(row, 10),
        isAbsence: str(row, 11),
      });
    });
    return rows;
  }

  private parseShiftTemplate(workbook: ExcelJS.Workbook) {
    const sheet = workbook.getWorksheet(MIGRATION_SHEET_NAMES.SHIFT_TEMPLATE);
    const rows: ParsedWorkbook['shiftTemplate'] = [];
    if (!sheet) return rows;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const name = str(row, 1);
      if (isBlankRow([name])) return;
      rows.push({
        rowNumber,
        name,
        startTime: str(row, 2),
        endTime: str(row, 3),
        breakStartTime: str(row, 4),
        breakEndTime: str(row, 5),
        crossesMidnight: str(row, 6),
        applicableWeekdays: str(row, 7),
      });
    });
    return rows;
  }

  private parseSchedule(workbook: ExcelJS.Workbook) {
    const sheet = workbook.getWorksheet(MIGRATION_SHEET_NAMES.SCHEDULE);
    const rows: ParsedWorkbook['schedule'] = [];
    if (!sheet) return rows;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const employeeNo = str(row, 1);
      const workDate = str(row, 2);
      if (isBlankRow([employeeNo, workDate])) return;
      rows.push({
        rowNumber,
        employeeNo,
        workDate,
        shiftTemplateName: str(row, 3),
        breakMinutes: num(row, 4),
      });
    });
    return rows;
  }

  private parseReconciliation(workbook: ExcelJS.Workbook) {
    const sheet = workbook.getWorksheet(MIGRATION_SHEET_NAMES.RECONCILIATION);
    const rows: ParsedWorkbook['reconciliation'] = [];
    if (!sheet) return rows;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const employeeNo = str(row, 1);
      const metric = str(row, 2);
      if (isBlankRow([employeeNo, metric])) return;
      rows.push({ rowNumber, employeeNo, metric, manualValue: num(row, 3) });
    });
    return rows;
  }
}
