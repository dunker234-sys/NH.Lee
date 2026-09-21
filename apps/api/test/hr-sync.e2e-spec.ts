import { INestApplication } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as iconv from 'iconv-lite';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp } from './setup/app';
import { resetDatabase, adminPrisma } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadHrSyncPolicyConfigFixture, loadNotificationPolicyConfigFixture } from './fixtures';

const HEADER = 'employeeNo,name,siteCode,department,jobTitle,employmentType,hireDate,resignationDate,contractedWorkMinutes,managerEmployeeNo,effectiveDate';

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 15000, intervalMs = 150): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`waitFor 타임아웃(${timeoutMs}ms) 초과`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function writeFeed(dir: string, filename: string, rows: string[], encoding: 'utf8' | 'euc-kr' = 'utf8'): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  await fs.mkdir(dir, { recursive: true });
  const csv = `${HEADER}\n${rows.join('\n')}\n`;
  const content = encoding === 'utf8' ? Buffer.from(csv, 'utf8') : iconv.encode(csv, 'euc-kr');
  await fs.writeFile(path.join(dir, filename), content);
}

const FILLER_COUNT = 15;

/** 자동적용/보류 임계값(10%) 계산의 분모를 충분히 키우기 위한 필러 재직자. */
async function createFillerEmployees(siteId: string): Promise<void> {
  for (let i = 1; i <= FILLER_COUNT; i += 1) {
    await adminPrisma.employee.create({
      data: {
        employeeNo: `FILL${String(i).padStart(4, '0')}`,
        name: `필러${i}`,
        employmentType: 'REGULAR',
        hireDate: new Date('2020-01-01'),
        primarySiteId: siteId,
      },
    });
  }
}

function fillerRows(): string[] {
  return Array.from({ length: FILLER_COUNT }, (_, i) => {
    const no = `FILL${String(i + 1).padStart(4, '0')}`;
    return `${no},필러${i + 1},SITE-TEST-A,,,REGULAR,2020-01-01,,,,2020-01-01`;
  });
}

/**
 * 인사시스템 추출 파일은 "변경분"이 아니라 매번 전 재직 인원의 스냅샷이다
 * (diff 엔진이 "피드에 없으면 퇴사"로 판정하므로 — hr-sync-diff.ts). 픽스처
 * 5명 + 필러 15명을 실제 DB 상태 그대로(변경 없음) 매 피드에 포함시켜,
 * 그들이 매번 DEPARTED로 오판정되지 않게 한다. 전체 재직 20명 기준
 * 1명 변경 = 5%(자동적용), 4명 변경 = 20%(보류) 시나리오를 구성한다.
 */
function baselineRows(): string[] {
  return [
    `T-SM-A,테스트-T-SM-A,SITE-TEST-A,,,REGULAR,2024-01-01,,,,2020-01-01`,
    `T-SM-B,테스트-T-SM-B,SITE-TEST-B,,,REGULAR,2024-01-01,,,,2020-01-01`,
    `T-HQHR,테스트-T-HQHR,SITE-TEST-A,,,REGULAR,2024-01-01,,,,2020-01-01`,
    `T-REGIONAL,테스트-T-REGIONAL,SITE-TEST-A,,,REGULAR,2024-01-01,,,,2020-01-01`,
    `T-EMP-A,테스트-T-EMP-A,SITE-TEST-A,,,REGULAR,2024-01-01,,,,2020-01-01`,
    ...fillerRows(),
  ];
}

/**
 * 요구사항서 5장 인사연동 어댑터 e2e. FileAdapter 기준으로(설정 한 줄 전환
 * 자체는 hr-sync-adapter.selector.spec.ts가 단위 테스트로 커버) 완료조건
 * 4개를 확인한다: dry-run 무적재, 15% 초과 시 자동적용 차단+확인 요구,
 * EUC-KR CSV 정상 처리, 승인 후 실제 반영.
 */
describe('HR 연동 — 요구사항서 5장', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let feedDir: string;

  beforeAll(async () => {
    feedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hr-sync-e2e-'));
    process.env.HR_SYNC_ADAPTER_TYPE = 'FILE';
    process.env.HR_SYNC_FILE_PATH = feedDir;

    await resetDatabase();
    fixture = await loadFixture();
    await createFillerEmployees(fixture.siteA.id);
    await loadHrSyncPolicyConfigFixture(); // hrSyncAutoApplyChangeRatioThreshold = 0.10
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
    await fs.rm(feedDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('dry-run은 실제 적재 없이 변경 예정 내역만 출력한다', async () => {
    await writeFeed(feedDir, 'dry-run.csv', [
      ...baselineRows(),
      'DRY001,드라이런직원,SITE-TEST-A,,,REGULAR,2026-01-02,,,,2026-01-01',
    ]);

    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'hr-sync-dryrun');
    const res = await request(app.getHttpServer())
      .post('/admin/hr-sync/dry-run')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ asOfDate: '2026-01-01' })
      .expect(201);

    expect(res.body.status).toBe('DRY_RUN');
    expect(res.body.newCount).toBe(1);
    expect(res.body.entries).toEqual([expect.objectContaining({ employeeNo: 'DRY001', changeType: 'NEW' })]);

    const employee = await prisma.employee.findUnique({ where: { employeeNo: 'DRY001' } });
    expect(employee).toBeNull();
    const batchCount = await prisma.hrSyncBatch.count();
    expect(batchCount).toBe(0);
  });

  it('변경 비율이 임계값(10%) 미만이면 자동 적용된다', async () => {
    await writeFeed(feedDir, 'small-change.csv', [
      ...baselineRows(),
      'AUTO001,자동적용직원,SITE-TEST-A,,,REGULAR,2026-01-02,,,,2026-01-01',
    ]);

    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'hr-sync-auto');
    await request(app.getHttpServer())
      .post('/admin/hr-sync/run')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ asOfDate: '2026-01-01' })
      .expect(201);

    await waitFor(async () => (await prisma.employee.findUnique({ where: { employeeNo: 'AUTO001' } })) !== null);

    const employee = await prisma.employee.findUniqueOrThrow({ where: { employeeNo: 'AUTO001' } });
    expect(employee.status).toBe('ACTIVE');
    expect(employee.primarySiteId).toBe(fixture.siteA.id);

    const assignment = await prisma.employeeSiteAssignment.findFirst({ where: { employeeId: employee.id, assignmentRole: 'PRIMARY' } });
    expect(assignment).not.toBeNull();

    const batch = await prisma.hrSyncBatch.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(batch?.status).toBe('AUTO_APPLIED');
    expect(batch?.newCount).toBe(1);
  });

  it('15% 이상 변경 시나리오에서는 자동 적용이 차단되고 확인을 요구한다', async () => {
    // 현재 재직 인원(픽스처 5명 + 필러 15명 + 앞선 자동적용 1명 = 21명) 대비
    // 신규 4명은 4/21 ≈ 19% > 10% 임계값이다.
    await writeFeed(feedDir, 'bulk-change.csv', [
      ...baselineRows(),
      'AUTO001,자동적용직원,SITE-TEST-A,,,REGULAR,2026-01-02,,,,2026-01-01',
      'BULK001,대량1,SITE-TEST-A,,,REGULAR,2026-01-02,,,,2026-01-01',
      'BULK002,대량2,SITE-TEST-A,,,REGULAR,2026-01-02,,,,2026-01-01',
      'BULK003,대량3,SITE-TEST-A,,,REGULAR,2026-01-02,,,,2026-01-01',
      'BULK004,대량4,SITE-TEST-A,,,REGULAR,2026-01-02,,,,2026-01-01',
    ]);

    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'hr-sync-bulk');
    const beforeRunAt = new Date();
    await request(app.getHttpServer())
      .post('/admin/hr-sync/run')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ asOfDate: '2026-01-02' })
      .expect(201);

    let batch: { id: string; status: string } | null = null;
    await waitFor(async () => {
      batch = await prisma.hrSyncBatch.findFirst({ where: { createdAt: { gt: beforeRunAt } }, orderBy: { createdAt: 'desc' } });
      return batch !== null;
    });
    expect(batch!.status).toBe('PENDING_REVIEW');

    const createdBulk1 = await prisma.employee.findUnique({ where: { employeeNo: 'BULK001' } });
    expect(createdBulk1).toBeNull(); // 자동 적용되지 않았다 — 실제 적재 없음

    // HQ_HR에게 검토 요청 알림이 발송되었는지 확인한다.
    await waitFor(async () => {
      const alerts = await prisma.alertLog.findMany({
        where: { notificationType: 'HR_SYNC_REVIEW_REQUIRED', recipientEmployeeId: fixture.employees.hqHr.id },
      });
      return alerts.length > 0;
    });

    // 관리자 승인 → 실제 반영된다.
    await request(app.getHttpServer())
      .post(`/admin/hr-sync/batches/${batch!.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const created1 = await prisma.employee.findUniqueOrThrow({ where: { employeeNo: 'BULK001' } });
    const created2 = await prisma.employee.findUniqueOrThrow({ where: { employeeNo: 'BULK002' } });
    expect(created1.status).toBe('ACTIVE');
    expect(created2.status).toBe('ACTIVE');

    const appliedBatch = await prisma.hrSyncBatch.findUniqueOrThrow({ where: { id: batch!.id } });
    expect(appliedBatch.status).toBe('APPLIED');
  });

  it('EUC-KR로 인코딩된 CSV가 깨짐 없이 처리된다', async () => {
    await writeFeed(
      feedDir,
      'euckr-feed.csv',
      [...baselineRows(), 'EUCKR01,박영희,SITE-TEST-A,인사팀,대리,REGULAR,2026-01-05,,,,2026-01-01'],
      'euc-kr',
    );

    const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'hr-sync-euckr');
    const res = await request(app.getHttpServer())
      .post('/admin/hr-sync/dry-run')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ asOfDate: '2026-01-05' })
      .expect(201);

    const entry = res.body.entries.find((e: { employeeNo: string }) => e.employeeNo === 'EUCKR01');
    expect(entry).toBeDefined();
    expect(entry.after.name).toBe('박영희');
    expect(entry.after.department).toBe('인사팀');
  });
});
