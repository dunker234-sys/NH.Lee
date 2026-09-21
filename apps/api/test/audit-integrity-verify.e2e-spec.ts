import { INestApplication } from '@nestjs/common';
import { AuditLogService } from '../src/common/audit/audit-log.service';
import { AuditIntegrityVerifyService } from '../src/modules/audit-integrity/audit-integrity-verify.service';
import { AuditMerkleSealService } from '../src/modules/audit-integrity/audit-merkle-seal.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';

/** ROADMAP STEP8 완료조건4: "무결성 검증 배치가 정상 데이터에 오탐을 내지 않는다." */
describe('감사로그 무결성 검증 배치 (STEP8)', () => {
  let app: INestApplication;
  let auditLog: AuditLogService;
  let sealService: AuditMerkleSealService;
  let verifyService: AuditIntegrityVerifyService;

  beforeAll(async () => {
    await resetDatabase();
    app = await createTestApp();
    auditLog = app.get(AuditLogService);
    sealService = app.get(AuditMerkleSealService);
    verifyService = app.get(AuditIntegrityVerifyService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('정상 데이터는 해시 체인 검증에서 오탐이 없다(봉인 전)', async () => {
    for (let i = 0; i < 10; i++) {
      await auditLog.write({
        actorPrincipal: `integrity-test-actor-${i}`,
        actorRole: 'HQ_HR',
        eventType: 'INTEGRITY_TEST',
        resourceType: 'IntegrityTest',
        afterValue: { i },
      });
    }

    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const report = await verifyService.verify(from, to);
    expect(report.ok).toBe(true);
    expect(report.checkedCount).toBe(10);
    expect(report.mismatches).toEqual([]);
  });

  it('Merkle 봉인 후에도 정상 데이터는 여전히 오탐이 없다', async () => {
    const hourStart = new Date();
    hourStart.setUTCMinutes(0, 0, 0);

    const sealed = await sealService.sealHour(hourStart);
    expect(sealed).not.toBeNull();
    expect(sealed!.recordCount).toBe(10);

    const from = new Date(hourStart.getTime() - 60 * 60 * 1000);
    const to = new Date(hourStart.getTime() + 2 * 60 * 60 * 1000);
    const report = await verifyService.verify(from, to);
    expect(report.ok).toBe(true);
    expect(report.mismatches).toEqual([]);
  });

  it('같은 시간대를 다시 봉인해도 멱등하다(중복 행이 생기지 않는다)', async () => {
    const hourStart = new Date();
    hourStart.setUTCMinutes(0, 0, 0);

    await sealService.sealHour(hourStart);
    const roots = await sealService.listSealedRoots(
      new Date(hourStart.getTime() - 1000),
      new Date(hourStart.getTime() + 60 * 60 * 1000 + 1000),
    );
    expect(roots.length).toBe(1);
  });
});
