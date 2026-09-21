import { PrismaClient } from '@prisma/client';
import { resetDatabase } from './setup/db';

const RETENTION_JOB_URL =
  'postgresql://retention_job:retention_job_dev_password@localhost:5432/attendance_test?schema=public&connection_limit=3';

/**
 * STEP12 권한 우회 재점검: retention_job 롤은 punch_location만 SELECT/DELETE
 * 가능하고, punch_raw는 SELECT만(수정 권한 없음), audit_log는 INSERT만
 * 가능하다(roles_post_migrate.sql). 애플리케이션 코드가 아니라 DB 권한
 * 자체가 강제하므로, 이 스펙은 그 SQL 권한 경계를 직접 재현·회귀 확인한다
 * (punch-raw-append-only-trigger.e2e-spec.ts가 app_rw/migrator에 대해
 * 이미 하는 것과 같은 검증을 retention_job에 대해 한다).
 */
describe('retention_job DB 롤 권한 경계 (STEP12)', () => {
  let retentionPrisma: PrismaClient;

  beforeAll(async () => {
    await resetDatabase();
    retentionPrisma = new PrismaClient({ datasources: { db: { url: RETENTION_JOB_URL } } });
  }, 30000);

  afterAll(async () => {
    await retentionPrisma.$disconnect();
  });

  it('punch_raw에 대해 UPDATE는 권한 오류로 거부된다', async () => {
    await expect(retentionPrisma.$executeRawUnsafe("UPDATE punch_raw SET review_note = 'x'")).rejects.toThrow();
  });

  it('punch_raw에 대해 DELETE는 권한 오류로 거부된다', async () => {
    await expect(retentionPrisma.$executeRawUnsafe('DELETE FROM punch_raw')).rejects.toThrow();
  });

  it('punch_raw에 대한 SELECT는 허용된다(파기 대상 판별용 조인)', async () => {
    await expect(retentionPrisma.$queryRawUnsafe('SELECT count(*) FROM punch_raw')).resolves.toBeDefined();
  });

  it('punch_location에 대해 SELECT/DELETE는 허용된다', async () => {
    await expect(retentionPrisma.$queryRawUnsafe('SELECT count(*) FROM punch_location')).resolves.toBeDefined();
    await expect(retentionPrisma.$executeRawUnsafe("DELETE FROM punch_location WHERE id = '00000000-0000-0000-0000-000000000000'")).resolves.toBeDefined();
  });

  it('audit_log에 대해 관련 없는 테이블(employee)은 권한이 없다', async () => {
    await expect(retentionPrisma.$queryRawUnsafe('SELECT count(*) FROM employee')).rejects.toThrow();
  });
});
