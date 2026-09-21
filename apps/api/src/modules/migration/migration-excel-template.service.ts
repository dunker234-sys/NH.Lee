import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MIGRATION_SHEET_NAMES } from './migration-excel.types';

/** 사업장별 이관 워크북 템플릿. 시트별 헤더 + 참고용(현재 직원/교대패턴
 * 목록) 시트를 함께 담는다 — schedule-excel.service.ts#downloadTemplate와
 * 같은 패턴. */
@Injectable()
export class MigrationExcelTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async downloadTemplate(siteId: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    workbook.addWorksheet(MIGRATION_SHEET_NAMES.LEAVE_BALANCE).addRow([
      '사번', '휴가유형코드', '기준기간', '발생일(YYYY-MM-DD)', '만료일(YYYY-MM-DD)', '발생일수', '사용일수', '이월일수', '소멸일수', '근거메모',
    ]);
    workbook.addWorksheet(MIGRATION_SHEET_NAMES.PROMOTION_LOG).addRow([
      '사번', '단계(FIRST_NOTICE/SECOND_NOTICE)', '통지일(YYYY-MM-DD)', '기한일(YYYY-MM-DD)', '통지방법(WRITTEN_PAPER/ELECTRONIC_DOCUMENT)',
      '발송일시(YYYY-MM-DD, 선택)', '수신일시(YYYY-MM-DD, 선택)', '요건충족(Y/N)', '회신내용(선택)',
    ]);
    workbook.addWorksheet(MIGRATION_SHEET_NAMES.ATTENDANCE_MONTHLY).addRow([
      '사번', '귀속월(YYYY-MM)', '소정근로분', '실근로분', '승인연장분', '미승인연장분', '야간근로분',
      '휴일근로8h이내분', '휴일근로8h초과분', '유급휴가분', '결근일수',
    ]);
    workbook.addWorksheet(MIGRATION_SHEET_NAMES.ATTENDANCE_DAILY).addRow([
      '사번', '근무일(YYYY-MM-DD)', '소정근로분', '실근로분', '승인연장분', '미승인연장분', '야간근로분',
      '휴일근로8h이내분', '휴일근로8h초과분', '유급휴가분', '결근여부(Y/N)',
    ]);
    workbook.addWorksheet(MIGRATION_SHEET_NAMES.SHIFT_TEMPLATE).addRow([
      '패턴명', '시작(HH:mm)', '종료(HH:mm)', '휴게시작(HH:mm, 선택)', '휴게종료(HH:mm, 선택)', '자정넘김(Y/N)', '적용요일(1-7 콤마구분)',
    ]);
    workbook.addWorksheet(MIGRATION_SHEET_NAMES.SCHEDULE).addRow(['사번', '근무일(YYYY-MM-DD, 기준일 이후)', '교대패턴명', '휴게(분)']);
    workbook.addWorksheet(MIGRATION_SHEET_NAMES.RECONCILIATION).addRow([
      '사번', '항목(ANNUAL_LEAVE_REMAINING_DAYS/ATTENDANCE_MONTHLY_ACTUAL_MINUTES)', '수기값',
    ]);

    const employees = await this.prisma.employee.findMany({
      where: { siteAssignments: { some: { siteId } } },
      select: { employeeNo: true, name: true, hireDate: true },
      orderBy: { employeeNo: 'asc' },
    });
    const employeeRefSheet = workbook.addWorksheet('참고_직원목록');
    employeeRefSheet.addRow(['사번', '성명', '입사일']);
    for (const e of employees) employeeRefSheet.addRow([e.employeeNo, e.name, e.hireDate.toISOString().slice(0, 10)]);

    const templates = await this.prisma.shiftTemplate.findMany({ where: { siteId }, select: { name: true } });
    const templateRefSheet = workbook.addWorksheet('참고_교대패턴목록');
    templateRefSheet.addRow(['패턴명']);
    for (const t of templates) templateRefSheet.addRow([t.name]);

    const leaveTypes = await this.prisma.leaveType.findMany({ select: { code: true, name: true, category: true } });
    const leaveTypeRefSheet = workbook.addWorksheet('참고_휴가유형목록');
    leaveTypeRefSheet.addRow(['코드', '이름', '분류']);
    for (const lt of leaveTypes) leaveTypeRefSheet.addRow([lt.code, lt.name, lt.category]);

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
