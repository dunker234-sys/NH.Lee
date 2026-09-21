import * as SQLite from 'expo-sqlite';
import { SqlExecutor, ensureSchema } from './punchQueueLogic';

const DB_NAME = 'attendance-offline.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync('PRAGMA journal_mode = WAL;');
      return db;
    });
  }
  return dbPromise;
}

/** expo-sqlite를 SqlExecutor 모양으로 감싼다 — punchQueueLogic.ts는 이 타입만 알면 된다. */
export const sqlExecutor: SqlExecutor = {
  async execAsync(sql) {
    const db = await getDb();
    await db.execAsync(sql);
  },
  async runAsync(sql, params) {
    const db = await getDb();
    await db.runAsync(sql, params as SQLite.SQLiteBindValue[]);
  },
  async getAllAsync<T>(sql: string, params: unknown[]) {
    const db = await getDb();
    return db.getAllAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
  },
};

let initPromise: Promise<void> | null = null;

/** 앱 부팅 시 1회 호출 — 이미 초기화됐으면 캐시된 프라미스를 재사용한다. */
export function initOfflineDb(): Promise<void> {
  if (!initPromise) initPromise = ensureSchema(sqlExecutor);
  return initPromise;
}
