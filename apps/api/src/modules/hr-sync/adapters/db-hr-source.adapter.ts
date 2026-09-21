import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HrSourceAdapter, StandardHrRecord } from '../hr-sync.types';
import { DB_QUERY_RUNNER, DbQueryRunner } from './db-query-runner';

/**
 * DbAdapter: 인사시스템 DB를 읽기 전용으로 직접 조회한다. 커넥션 설정
 * (HR_SYNC_DB_CONNECTION_STRING)과 쿼리(HR_SYNC_DB_QUERY)를 모두 설정으로
 * 분리해, 대상 인사시스템의 스키마가 바뀌어도 쿼리 문자열만 고치면 되게
 * 한다 — 컬럼 별칭이 StandardHrRecord 필드명과 정확히 일치해야 한다
 * (예: `SELECT emp_no AS "employeeNo", ...`).
 */
@Injectable()
export class DbHrSourceAdapter implements HrSourceAdapter {
  constructor(
    private readonly config: ConfigService,
    @Inject(DB_QUERY_RUNNER) private readonly runner: DbQueryRunner,
  ) {}

  async fetchAll(_asOfDate: string): Promise<StandardHrRecord[]> {
    const sql = this.config.get<string>('hrSync.db.query');
    if (!sql) {
      throw new Error('HR_SYNC_DB_QUERY가 설정되지 않았습니다.');
    }
    const rows = await this.runner.query(sql);
    return rows.map((row) => this.toStandardRecord(row));
  }

  private toStandardRecord(row: Record<string, unknown>): StandardHrRecord {
    const str = (v: unknown): string => (v == null ? '' : String(v).trim());
    const optStr = (v: unknown): string | undefined => {
      const s = str(v);
      return s === '' ? undefined : s;
    };
    return {
      employeeNo: str(row.employeeNo),
      name: str(row.name),
      siteCode: str(row.siteCode),
      department: optStr(row.department),
      jobTitle: optStr(row.jobTitle),
      hireDate: str(row.hireDate),
      resignationDate: optStr(row.resignationDate),
      employmentType: str(row.employmentType),
      contractedWorkMinutes: row.contractedWorkMinutes == null ? undefined : Number(row.contractedWorkMinutes),
      managerEmployeeNo: optStr(row.managerEmployeeNo),
      effectiveDate: str(row.effectiveDate),
    };
  }
}
