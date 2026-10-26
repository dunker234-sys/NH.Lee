import { PrismaClient } from '@prisma/client';

// e2e가 멈췄을 때(예: app.close()나 TRUNCATE가 끝나지 않을 때) 원인을 로그에 남기는 진단용 모니터.
// 15초마다 attendance_test에서 10초 넘게 열려 있는 트랜잭션과 그것을 막고 있는 세션,
// 전체 접속 수를 점검해, 이상이 있을 때만 출력한다(정상이면 아무 것도 찍지 않는다).
// 점검 때만 연결을 열고 바로 닫으며, 타이머는 unref라 프로세스 종료를 막지 않는다.
// HANG_DIAGNOSTICS=0 이면 끈다.
const CHECK_INTERVAL_MS = 15_000;
const STUCK_TX_SECONDS = 10;
const HIGH_CONNECTION_COUNT = 70; // Postgres max_connections 기본값(100)의 70%

const MIGRATOR_URL =
  'postgresql://migrator:migrator_dev_password@localhost:5432/attendance_test?schema=public&connection_limit=1&connect_timeout=5';

async function check(): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: MIGRATOR_URL } } });
  try {
    const stuck = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT pid, usename, state, wait_event_type, wait_event,
             (now() - xact_start)::text AS xact_age,
             pg_blocking_pids(pid)::text AS blocked_by,
             left(query, 140) AS query
      FROM pg_stat_activity
      WHERE datname = 'attendance_test' AND pid <> pg_backend_pid()
        AND xact_start IS NOT NULL AND now() - xact_start > interval '${STUCK_TX_SECONDS} seconds'
      ORDER BY xact_start`);
    const [{ total }] = await prisma.$queryRawUnsafe<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM pg_stat_activity WHERE datname = 'attendance_test'`,
    );
    if (stuck.length > 0 || total >= HIGH_CONNECTION_COUNT) {
      // jest console은 테스트가 끝난 뒤 찍으면 "Cannot log after tests are done" 오류를 내므로
      // 표준 에러에 직접 쓴다.
      process.stderr.write(`[hang-diagnostics] connections=${total} longTx=${stuck.length}\n${JSON.stringify(stuck, null, 1)}\n`);
    }
  } catch (err) {
    // 접속 자체가 안 되는 상황(연결 고갈 등)도 단서다.
    process.stderr.write(`[hang-diagnostics] 점검 실패: ${(err as Error).message.split('\n')[0]}\n`);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

if (process.env.HANG_DIAGNOSTICS !== '0') {
  setInterval(() => void check(), CHECK_INTERVAL_MS).unref();
}
