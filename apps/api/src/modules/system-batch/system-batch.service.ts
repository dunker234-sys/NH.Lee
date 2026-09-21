import { Injectable } from '@nestjs/common';
import { SystemContextService } from '../../common/principal/system-context.service';
import { EmployeesRepository } from '../employees/employees.repository';

export interface DummyBatchResult {
  jobId: string;
  employeeCount: number;
  siteCount: number;
}

/**
 * SYSTEM 주체 증명용 더미 배치. HTTP로 노출하지 않는다 — 실제 제품에서 배치는
 * BullMQ 컨슈머(STEP 3.5)가 트리거하지 사용자가 호출하는 API가 아니기 때문이다.
 * 로그인 컨텍스트 없이 전 사업장 직원을 조회하고, 그 사실이 audit_log에
 * scope_bypassed=true로 남는 것을 증명한다 (STEP 2 완료조건 3).
 */
@Injectable()
export class SystemBatchService {
  constructor(
    private readonly systemContext: SystemContextService,
    private readonly employeesRepo: EmployeesRepository,
  ) {}

  async runDummyAllSitesBatch(): Promise<DummyBatchResult> {
    let jobId = '';
    const employees = await this.systemContext.runAsSystem('employee', async (principal, scope) => {
      jobId = principal.jobId;
      return this.employeesRepo.findMany(scope);
    });

    return {
      jobId,
      employeeCount: employees.length,
      siteCount: new Set(employees.map((e) => e.primarySiteId)).size,
    };
  }
}
