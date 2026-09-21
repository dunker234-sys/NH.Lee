import { DatabaseSync } from 'node:sqlite';
import { SqlExecutor } from '../punchQueueLogic';

/**
 * expo-sqlite 대신 Node 내장 node:sqlite(DatabaseSync)로 SqlExecutor를
 * 구현한다 — better-sqlite3 같은 네이티브 컴파일이 필요한 패키지 없이도
 * 실제 SQLite 엔진으로 테스트한다(이 환경엔 Visual Studio Build Tools가
 * 없어 네이티브 addon을 빌드할 수 없었다 — node:sqlite는 Node 22.5+에
 * 내장되어 있어 이 문제를 겪지 않는다).
 */
export function createNodeSqliteExecutor(): SqlExecutor {
  const db = new DatabaseSync(':memory:');
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params) {
      db.prepare(sql).run(...(params as (string | number | null)[]));
    },
    async getAllAsync<T>(sql: string, params: unknown[]) {
      return db.prepare(sql).all(...(params as (string | number | null)[])) as T[];
    },
  };
}
