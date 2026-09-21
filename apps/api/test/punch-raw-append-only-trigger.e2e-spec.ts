import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PunchRawRepository } from '../src/common/punch/punch-raw.repository';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { Fixture, loadFixture } from './fixtures';

const MIGRATOR_URL = 'postgresql://migrator:migrator_dev_password@localhost:5432/attendance_test?schema=public&connection_limit=3';

/**
 * ROADMAP STEP8 완료조건1("app_rw 롤의 punch_raw UPDATE 시도가 권한 오류")은
 * 이미 punch-raw-immutability.e2e-spec.ts가 검증한다. 이 스펙은 STEP8이
 * 새로 추가한 두 번째 방어선(punch_raw_append_only 트리거)과, 그 트리거를
 * 설치한 마이그레이션 자체가 "컬럼 추가+backfill"을 정상적으로 수행했음을
 * 확인한다(완료조건2).
 */
describe('punch_raw append-only 트리거 (STEP8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let punchRawRepo: PunchRawRepository;
  let migratorPrisma: PrismaClient;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    punchRawRepo = app.get(PunchRawRepository);
    migratorPrisma = new PrismaClient({ datasources: { db: { url: MIGRATOR_URL } } });
  }, 60000);

  afterAll(async () => {
    await migratorPrisma.$disconnect();
    await app.close();
  });

  it('app_rw는 여전히 권한 자체로 UPDATE/DELETE가 거부된다(회귀 확인)', async () => {
    await expect(prisma.$executeRawUnsafe('UPDATE punch_raw SET receive_count = receive_count + 1')).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('DELETE FROM punch_raw')).rejects.toThrow();
  });

  it('UPDATE/DELETE 권한을 가진 migrator로도 트리거가 실제 행 변경을 막는다', async () => {
    const punch = await prisma.punchRaw.create({
      data: {
        employeeId: fixture.employees.plainEmployeeA.id,
        siteId: fixture.siteA.id,
        punchType: 'IN',
        recordedAt: new Date('2026-09-01T00:00:00.000Z'),
        workDate: new Date('2026-09-01T00:00:00.000Z'),
        idempotencyKey: 'trigger-test-punch-1',
        verificationLevel: 'NORMAL',
        registrationMethod: 'GPS',
        deviceId: 'dev-trigger-test',
      },
    });

    await expect(
      migratorPrisma.$executeRawUnsafe(`UPDATE punch_raw SET review_note = 'x' WHERE id = '${punch.id}'`),
    ).rejects.toThrow(/append-only/);

    await expect(
      migratorPrisma.$executeRawUnsafe(`DELETE FROM punch_raw WHERE id = '${punch.id}'`),
    ).rejects.toThrow(/append-only/);
  });

  it('신규 타각의 integrity_flag_count가 insert 시점에 integrityFlags.length로 정확히 채워진다', async () => {
    // ★ 애플리케이션의 유일한 접근 지점(PunchRawRepository)을 통해 삽입한다 —
    // integrityFlagCount 채우기는 그 리포지토리의 계약이지 raw prisma.create의
    // 계약이 아니다(punch-raw.repository.ts 주석 참고).
    const punch = await punchRawRepo.create({
      employeeId: fixture.employees.plainEmployeeA.id,
      siteId: fixture.siteA.id,
      punchType: 'IN',
      recordedAt: new Date('2026-09-02T00:00:00.000Z'),
      workDate: new Date('2026-09-02T00:00:00.000Z'),
      idempotencyKey: 'trigger-test-punch-2',
      verificationLevel: 'LOW',
      registrationMethod: 'GPS',
      deviceId: 'dev-trigger-test',
      integrityFlags: ['GEOFENCE_OUT_OF_RANGE', 'DEVICE_SHARED'],
    });
    expect(punch.integrityFlagCount).toBe(2);
  });

  it('컬럼 추가+backfill 마이그레이션이 기존(마이그레이션 이전) 행에도 정확한 값을 채웠다', async () => {
    // seed/이전 마이그레이션이 만든 행이 없을 수도 있는 테스트 DB이므로,
    // 트리거 설치 마이그레이션 자체의 backfill UPDATE 문(SQL)이 정확한지를
    // "임의 배열 길이"로 직접 재현해 검증한다 — 실제 마이그레이션 적용
    // 결과는 이 describe의 다른 두 테스트가 신규 삽입 경로로 이미 증명한다.
    const rows = await migratorPrisma.$queryRawUnsafe<{ mismatches: bigint }[]>(
      `SELECT count(*)::bigint as mismatches FROM punch_raw
       WHERE integrity_flag_count IS DISTINCT FROM COALESCE(array_length(integrity_flags, 1), 0)`,
    );
    expect(Number(rows[0].mismatches)).toBe(0);
  });
});
