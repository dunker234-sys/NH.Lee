import * as ExcelJS from 'exceljs';
import { MIGRATION_SHEET_NAMES } from '../src/modules/migration/migration-excel.types';

export interface MigrationWorkbookInput {
  leaveBalance?: (string | number)[][];
  promotionLog?: (string | number)[][];
  attendanceMonthly?: (string | number)[][];
  attendanceDaily?: (string | number)[][];
  shiftTemplate?: (string | number)[][];
  schedule?: (string | number)[][];
  reconciliation?: (string | number)[][];
}

const HEADERS: Record<keyof MigrationWorkbookInput, string[]> = {
  leaveBalance: ['사번', '휴가유형코드', '기준기간', '발생일', '만료일', '발생일수', '사용일수', '이월일수', '소멸일수', '근거메모'],
  promotionLog: ['사번', '단계', '통지일', '기한일', '통지방법', '발송일시', '수신일시', '요건충족', '회신내용'],
  attendanceMonthly: [
    '사번', '귀속월', '소정근로분', '실근로분', '승인연장분', '미승인연장분', '야간근로분', '휴일근로8h이내분', '휴일근로8h초과분', '유급휴가분', '결근일수',
  ],
  attendanceDaily: [
    '사번', '근무일', '소정근로분', '실근로분', '승인연장분', '미승인연장분', '야간근로분', '휴일근로8h이내분', '휴일근로8h초과분', '유급휴가분', '결근여부',
  ],
  shiftTemplate: ['패턴명', '시작', '종료', '휴게시작', '휴게종료', '자정넘김', '적용요일'],
  schedule: ['사번', '근무일', '교대패턴명', '휴게(분)'],
  reconciliation: ['사번', '항목', '수기값'],
};

const SHEET_NAME_BY_KEY: Record<keyof MigrationWorkbookInput, string> = {
  leaveBalance: MIGRATION_SHEET_NAMES.LEAVE_BALANCE,
  promotionLog: MIGRATION_SHEET_NAMES.PROMOTION_LOG,
  attendanceMonthly: MIGRATION_SHEET_NAMES.ATTENDANCE_MONTHLY,
  attendanceDaily: MIGRATION_SHEET_NAMES.ATTENDANCE_DAILY,
  shiftTemplate: MIGRATION_SHEET_NAMES.SHIFT_TEMPLATE,
  schedule: MIGRATION_SHEET_NAMES.SCHEDULE,
  reconciliation: MIGRATION_SHEET_NAMES.RECONCILIATION,
};

/** 테스트가 migration-excel-template.service.ts와 같은 시트 이름/컬럼
 * 순서로 워크북을 직접 조립할 수 있게 돕는다(서버가 주는 템플릿을
 * 실제로 내려받아 채우는 흐름을 테스트마다 반복하지 않기 위함). */
export async function buildMigrationWorkbook(input: MigrationWorkbookInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const key of Object.keys(SHEET_NAME_BY_KEY) as (keyof MigrationWorkbookInput)[]) {
    const sheet = workbook.addWorksheet(SHEET_NAME_BY_KEY[key]);
    sheet.addRow(HEADERS[key]);
    for (const row of input[key] ?? []) sheet.addRow(row);
  }
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
