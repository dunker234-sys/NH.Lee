import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';

/**
 * 코드 레벨 보호(PunchRawRepository에 update/delete가 없음)는
 * src/common/punch/punch-raw.repository.spec.ts에서 이미 확인했다. 여기서는
 * "앱이 실제로 연결하는 계정(app_rw)으로는 raw SQL을 써도 UPDATE가 막힌다"는
 * DB 레벨 보호를 재확인한다 — ADMIN이 API를 우회해 직접 시도해도 막힌다는 뜻이다.
 */
describe('punch_raw 불변성 (DB 권한 레벨)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('앱의 DB 연결(app_rw)로는 punch_raw UPDATE가 권한 오류로 거부된다', async () => {
    await expect(
      prisma.$executeRawUnsafe('UPDATE punch_raw SET receive_count = receive_count + 1'),
    ).rejects.toThrow();
  });

  it('앱의 DB 연결(app_rw)로는 punch_raw DELETE도 권한 오류로 거부된다', async () => {
    await expect(prisma.$executeRawUnsafe('DELETE FROM punch_raw')).rejects.toThrow();
  });
});
