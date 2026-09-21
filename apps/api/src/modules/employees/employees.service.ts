import { Injectable } from '@nestjs/common';
import { Employee } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { OrgScope } from '../../common/scope/org-scope.types';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { EmployeesRepository } from './employees.repository';

const PIN_BCRYPT_ROUNDS = 10;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly repo: EmployeesRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  list(scope: OrgScope, siteId?: string): Promise<Employee[]> {
    return this.repo.findMany(scope, { siteId });
  }

  /** AuthService.changePassword()의 관리자 발급판 — 워커 본인이 아니라
   * 관리자가 PIN을 새로 설정/재설정한다(개인폰이 없는 인력은 셀프서비스
   * 비밀번호 재설정 흐름을 쓸 수 없다는 전제 자체가 이 STEP의 출발점이다). */
  async setPin(scope: OrgScope, employeeId: string, pin: string): Promise<{ success: true }> {
    const pinHash = await bcrypt.hash(pin, PIN_BCRYPT_ROUNDS);
    await this.repo.setPin(scope, employeeId, pinHash);
    return { success: true };
  }

  /** STEP6: HQ_HR 전용 보호 상태(임신 등) 신고. 민감정보 쓰기이므로 감사로그를
   * 남긴다 — 이 액션 자체가 "누가 언제 어떤 근거로 신고했는가"의 유일한 기록이다. */
  async setProtectedStatus(
    scope: OrgScope,
    principal: EmployeePrincipal,
    employeeId: string,
    input: { statusType: string; effectiveStartDate: string; effectiveEndDate?: string },
  ): Promise<{ id: string }> {
    const result = await this.repo.setProtectedStatus(scope, employeeId, principal.employeeId, {
      statusType: input.statusType,
      effectiveStartDate: new Date(`${input.effectiveStartDate}T00:00:00.000Z`),
      effectiveEndDate: input.effectiveEndDate ? new Date(`${input.effectiveEndDate}T00:00:00.000Z`) : undefined,
    });
    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'EMPLOYEE_PROTECTED_STATUS_DECLARED',
      resourceType: 'EmployeeProtectedStatus',
      resourceId: result.id,
      afterValue: { employeeId, ...input },
    });
    return result;
  }
}
