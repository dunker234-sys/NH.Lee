import { PrismaClient } from '@prisma/client';

// migrator(스키마 소유자) 계정으로 연결한다 — TRUNCATE는 app_rw 권한 밖이고,
// punch_raw는 app_rw로 애초에 DELETE가 안 되므로(STEP1) 테스트 정리 전용으로만 쓴다.
// ★ connection_limit을 명시한다 — Prisma 기본값은 CPU 코어수*2+1이라, 코어가
// 많은 머신(예: 18코어→37)에서는 이 모듈이 파일마다 새로 인스턴스화되고도
// 한 번도 $disconnect()되지 않아(Jest가 --runInBand로 여러 e2e 파일을 한
// 프로세스 안에서 순차 실행할 때도 파일마다 모듈 레지스트리가 새로 생김) 파일
// 수만큼 그대로 누적된다 — 몇 개 파일만 이어 돌려도 Postgres max_connections
// (기본 100)를 소진해 이후 모든 쿼리가 조용히 멈춰버린다(실측으로 재현·확인:
// punches류 3개 파일만으로 100/100 도달). resetDatabase()/픽스처 생성은
// 무거운 동시성이 필요 없으므로 작은 값으로 충분하다.
const MIGRATOR_TEST_URL =
  'postgresql://migrator:migrator_dev_password@localhost:5432/attendance_test?schema=public&connection_limit=5';

export const adminPrisma = new PrismaClient({ datasources: { db: { url: MIGRATOR_TEST_URL } } });

/** 모든 테이블을 비운다. 매 e2e 스펙 파일의 beforeAll에서 한 번 호출한다. */
export async function resetDatabase(): Promise<void> {
  const tables = await adminPrisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
  `;
  const names = tables.map((t) => `"${t.tablename}"`).join(', ');
  if (names.length > 0) {
    await adminPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  }
}
