import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditLogService } from '../audit/audit-log.service';
import { allScope, OrgScope } from '../scope/org-scope.types';
import { SystemPrincipal } from './principal.types';

/**
 * SYSTEM 주체로 함수를 실행한다. 배치·큐 워커가 로그인 컨텍스트 없이 전 사업장
 * 데이터에 접근해야 할 때(야간 배치, HR 동기화, 위치정보 파기 등) 쓰는 유일한
 * 통로다. 스코프 우회 사실은 실행 "전에" audit_log에 1건 기록한다 — 리포지토리
 * 호출마다 찍으면 로그가 과도해지므로, 잡(job) 단위로 한 번만 남긴다.
 */
@Injectable()
export class SystemContextService {
  constructor(private readonly auditLog: AuditLogService) {}

  async runAsSystem<T>(
    resourceType: string,
    fn: (principal: SystemPrincipal, scope: OrgScope) => Promise<T>,
    jobId: string = randomUUID(),
  ): Promise<T> {
    const principal: SystemPrincipal = { kind: 'SYSTEM', jobId };
    const scope = allScope();

    await this.auditLog.write({
      actorPrincipal: 'SYSTEM',
      actorRole: 'SYSTEM',
      eventType: 'SCOPE_BYPASS',
      resourceType,
      reason: `SYSTEM 배치(job=${jobId})가 조직 스코프를 우회해 전 범위(${resourceType})에 접근합니다.`,
      jobId,
      scopeBypassed: true,
    });

    return fn(principal, scope);
  }
}
