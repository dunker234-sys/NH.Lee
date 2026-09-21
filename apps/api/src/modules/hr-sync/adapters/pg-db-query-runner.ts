import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DbQueryRunner } from './db-query-runner';

/**
 * DbQueryRunner의 실제 구현 — 인사시스템 읽기 전용 DB 계정으로 연결한다.
 * 커넥션 문자열은 HR_SYNC_DB_CONNECTION_STRING(환경변수)에서만 읽는다 —
 * 이 계정에는 SELECT 권한만 부여되어 있어야 한다(운영 배포 절차, 코드가
 * 강제할 수 없음 — docs/HR_INTEGRATION.md에 명시).
 */
@Injectable()
export class PgDbQueryRunner implements DbQueryRunner, OnModuleDestroy {
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  private getPool(): Pool {
    if (!this.pool) {
      const connectionString = this.config.get<string>('hrSync.db.connectionString');
      if (!connectionString) {
        throw new Error('HR_SYNC_DB_CONNECTION_STRING이 설정되지 않았습니다.');
      }
      this.pool = new Pool({ connectionString, max: 3 });
    }
    return this.pool;
  }

  async query(sql: string): Promise<Record<string, unknown>[]> {
    const result = await this.getPool().query(sql);
    return result.rows;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
