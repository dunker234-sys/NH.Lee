import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmployeePrincipal } from '../../../common/principal/principal.types';
import { PartnerCompaniesService } from './partner-companies.service';

export interface PartnerExcelRowError {
  rowNumber: number;
  employeeNo: string;
  message: string;
}

export interface PartnerExcelImportResult {
  createdCount: number;
  rowErrors: PartnerExcelRowError[];
}

const COLUMNS = ['employeeNo', 'name', 'siteCode', 'hireDate', 'jobTitle', 'department'] as const;

/**
 * 협력사 소속 직원 엑셀 일괄 등록. migration-excel-parse.service.ts와 동일
 * 원칙(서버에서만 파싱) — 별도 라이브러리 없이 이미 쓰던 exceljs 재사용.
 * dry-run 없이 행 단위로 즉시 등록하고, 실패한 행만 오류로 모아 돌려준다
 * (전체를 막지 않는다 — HR 동기화 엔진의 부분 처리 원칙과 동일).
 */
@Injectable()
export class PartnerEmployeeExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partnerCompaniesService: PartnerCompaniesService,
  ) {}

  async importForCompany(companyId: string, principal: EmployeePrincipal, buffer: Buffer): Promise<PartnerExcelImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException({ code: 'PARTNER_EXCEL_EMPTY', message: '시트를 찾을 수 없습니다.' });
    }

    const sites = await this.prisma.site.findMany({ select: { id: true, code: true } });
    const siteCodeToId = new Map(sites.map((s) => [s.code, s.id]));

    let createdCount = 0;
    const rowErrors: PartnerExcelRowError[] = [];

    const rows: { rowNumber: number; cells: string[] }[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells = COLUMNS.map((_, idx) => String(row.getCell(idx + 1).value ?? '').trim());
      if (cells.every((c) => c === '')) return;
      rows.push({ rowNumber, cells });
    });

    for (const { rowNumber, cells } of rows) {
      const [employeeNo, name, siteCode, hireDate, jobTitle, department] = cells;
      const siteId = siteCodeToId.get(siteCode);
      if (!employeeNo || !name || !siteId || !hireDate) {
        rowErrors.push({ rowNumber, employeeNo, message: '필수값 누락 또는 사업장코드 불일치' });
        continue;
      }
      try {
        await this.partnerCompaniesService.registerEmployee(companyId, principal, {
          employeeNo,
          name,
          primarySiteId: siteId,
          hireDate,
          jobTitle: jobTitle || undefined,
          department: department || undefined,
        });
        createdCount += 1;
      } catch (e) {
        rowErrors.push({ rowNumber, employeeNo, message: e instanceof Error ? e.message : String(e) });
      }
    }

    return { createdCount, rowErrors };
  }
}
