/**
 * DbAdapter가 실제 커넥션/쿼리 실행을 위임하는 얇은 인터페이스. 목적은
 * 단위 테스트에서 실제 pg.Pool 없이 쿼리 결과를 주입할 수 있게 하는 것 —
 * DbAdapter 자체의 책임(컬럼 별칭 매핑)과 커넥션 관리를 분리한다.
 */
export interface DbQueryRunner {
  query(sql: string): Promise<Record<string, unknown>[]>;
}

export const DB_QUERY_RUNNER = Symbol('DB_QUERY_RUNNER');
