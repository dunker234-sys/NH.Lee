import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { HrSourceAdapter, StandardHrRecord } from '../hr-sync.types';
import { decodeCsvBuffer } from './csv-encoding.util';
import { parseCsv } from './csv-parse.util';

/**
 * 표준 인사정보 필드 순서 — CSV/XLSX 공통. SFTP/공유폴더가 이 순서로
 * 파일을 내려받아 둔다는 전제다(실제 SFTP 전송 프로토콜 구현은 범위 밖 —
 * docs/HR_INTEGRATION.md §중계 방식 참고). 1행은 헤더로 간주해 건너뛴다.
 */
const COLUMNS = [
  'employeeNo',
  'name',
  'siteCode',
  'department',
  'jobTitle',
  'employmentType',
  'hireDate',
  'resignationDate',
  'contractedWorkMinutes',
  'managerEmployeeNo',
  'effectiveDate',
] as const;

function cellsToRecord(cells: string[]): StandardHrRecord {
  const get = (name: (typeof COLUMNS)[number]): string => {
    const idx = COLUMNS.indexOf(name);
    return (cells[idx] ?? '').trim();
  };
  const contractedRaw = get('contractedWorkMinutes');
  return {
    employeeNo: get('employeeNo'),
    name: get('name'),
    siteCode: get('siteCode'),
    department: get('department') || undefined,
    jobTitle: get('jobTitle') || undefined,
    employmentType: get('employmentType'),
    hireDate: get('hireDate'),
    resignationDate: get('resignationDate') || undefined,
    contractedWorkMinutes: contractedRaw ? Number(contractedRaw) : undefined,
    managerEmployeeNo: get('managerEmployeeNo') || undefined,
    effectiveDate: get('effectiveDate'),
  };
}

/**
 * FileAdapter: SFTP/공유폴더가 이미 내려받아 둔 로컬 디렉터리(HR_SYNC_FILE_PATH)
 * 에서 가장 최근 수정된 .csv 또는 .xlsx 파일 하나를 읽는다. CSV는 EUC-KR/UTF-8을
 * 자동 판별한다(csv-encoding.util.ts).
 */
@Injectable()
export class FileHrSourceAdapter implements HrSourceAdapter {
  private readonly logger = new Logger(FileHrSourceAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async fetchAll(_asOfDate: string): Promise<StandardHrRecord[]> {
    const dir = this.config.get<string>('hrSync.file.path');
    if (!dir) {
      throw new Error('HR_SYNC_FILE_PATH가 설정되지 않았습니다.');
    }
    const filePath = await this.findLatestFile(dir);
    if (!filePath) {
      this.logger.warn(`HR_SYNC_FILE_PATH(${dir})에서 .csv/.xlsx 파일을 찾을 수 없습니다.`);
      return [];
    }

    if (filePath.toLowerCase().endsWith('.xlsx')) {
      return this.readXlsx(filePath);
    }
    return this.readCsv(filePath);
  }

  private async findLatestFile(dir: string): Promise<string | null> {
    const entries = await fs.readdir(dir);
    const candidates = entries.filter((f) => /\.(csv|xlsx)$/i.test(f));
    if (candidates.length === 0) return null;

    const withStat = await Promise.all(
      candidates.map(async (name) => {
        const full = path.join(dir, name);
        const stat = await fs.stat(full);
        return { full, mtimeMs: stat.mtimeMs };
      }),
    );
    withStat.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return withStat[0].full;
  }

  private async readCsv(filePath: string): Promise<StandardHrRecord[]> {
    const buffer = await fs.readFile(filePath);
    const text = decodeCsvBuffer(buffer);
    const rows = parseCsv(text);
    return rows.slice(1).map(cellsToRecord);
  }

  private async readXlsx(filePath: string): Promise<StandardHrRecord[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const records: StandardHrRecord[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells = COLUMNS.map((_, colIdx) => String(row.getCell(colIdx + 1).value ?? '').trim());
      if (cells.every((c) => c === '')) return;
      records.push(cellsToRecord(cells));
    });
    return records;
  }
}
