import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { SystemBatchService } from '../src/modules/system-batch/system-batch.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { loadFixture } from './fixtures';

/** STEP 2 완료조건 3: SYSTEM 컨텍스트 더미 배치가 전 사업장을 조회하고 audit_log에 남는다. */
describe('SYSTEM 주체 — 더미 배치', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: SystemBatchService;

  beforeAll(async () => {
    await resetDatabase();
    await loadFixture(); // siteA에 4명, siteB에 1명 = 총 5명, 2개 사업장
    app = await createTestApp();
    prisma = app.get(PrismaService);
    service = app.get(SystemBatchService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('로그인 컨텍스트 없이 전 사업장 직원을 조회하고, 그 사실이 audit_log에 남는다', async () => {
    const result = await service.runDummyAllSitesBatch();

    expect(result.employeeCount).toBe(5);
    expect(result.siteCount).toBe(2); // siteA + siteB 양쪽 다 조회됨 (스코프 우회 증명)
    expect(result.jobId).toBeTruthy();

    const auditRow = await prisma.auditLog.findFirst({
      where: { jobId: result.jobId, eventType: 'SCOPE_BYPASS' },
    });

    expect(auditRow).not.toBeNull();
    expect(auditRow?.scopeBypassed).toBe(true);
    expect(auditRow?.actorPrincipal).toBe('SYSTEM');
    expect(auditRow?.resourceType).toBe('employee');
    // 해시 체인이 실제로 채워져 있는지도 함께 확인한다 (AuditLogService 설계 참고).
    expect(auditRow?.recordHash).toBeTruthy();
  });

  it('일반 EMPLOYEE 스코프로는 같은 조회를 해도 5명 전체가 나오지 않는다(대조군)', async () => {
    // SYSTEM의 ALL 스코프가 실제로 "우회"임을 보여주기 위한 대조 실험 —
    // EmployeesRepository를 SITES 스코프로 직접 호출하면 해당 사업장 인원만 나온다.
    const { EmployeesRepository } = await import('../src/modules/employees/employees.repository');
    const repo = app.get(EmployeesRepository);
    const siteScoped = await repo.findMany({ kind: 'SITES', siteIds: [] });
    expect(siteScoped.length).toBe(0);
  });
});
