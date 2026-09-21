import { Injectable } from '@nestjs/common';
import { PolicyConfig } from '@prisma/client';
import { LeavePromotionPolicyConfig, validatePromotionDeadlinePolicy } from '@attendance/core-rules';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/time/week.util';
import { UpdateLeavePromotionPolicyDto } from './dto/update-leave-promotion-policy.dto';
import { LeavePromotionPolicyStatutoryViolationError } from './errors/leave-errors';

/**
 * 요구사항서4.3 §5 ★ — 이 앱 최초의 런타임 policy_config 쓰기 경로.
 * candidate 값을 core-rules의 validatePromotionDeadlinePolicy()(법정 기한
 * 리터럴과 비교하는 순수 함수)로 검증하고, 위반이 하나라도 있으면 저장
 * 자체를 거부한다 — 회사가 법정보다 이르게 설정하는 것은 언제나 허용한다.
 */
@Injectable()
export class LeavePromotionPolicyAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async update(principal: EmployeePrincipal, dto: UpdateLeavePromotionPolicyDto): Promise<PolicyConfig[]> {
    const candidate: LeavePromotionPolicyConfig = { ...dto.values };
    const { valid, violations } = validatePromotionDeadlinePolicy(candidate);
    if (!valid) {
      throw new LeavePromotionPolicyStatutoryViolationError(violations);
    }

    const effectiveStartDate = dateOnly(dto.effectiveStartDate);
    const created: PolicyConfig[] = [];
    for (const [key, value] of Object.entries(candidate)) {
      const row = await this.prisma.policyConfig.create({
        data: { key, value: value as never, siteId: dto.siteId ?? null, effectiveStartDate },
      });
      created.push(row);
    }

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'LEAVE_PROMOTION_POLICY_CHANGED',
      resourceType: 'PolicyConfig',
      afterValue: { siteId: dto.siteId ?? null, effectiveStartDate: dto.effectiveStartDate, values: candidate },
    });

    return created;
  }
}
