import { Injectable } from '@nestjs/common';
import { CorrectionRequest } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope } from '../../common/scope/scope.util';
import { dateOnly } from '../../common/time/week.util';
import { RecalculationTriggerService } from '../recalculation/recalculation-trigger.service';
import { NotificationService } from '../notifications/notification.service';
import { assertValidAfterValueForSubmission } from '../../common/correction/correction-payload.util';
import { assertCorrectionTargetPeriodOpen } from './correction-period-guard.util';
import { AdminCorrectionDto } from './dto/admin-correction.dto';
import { MalformedCorrectionPayloadSubmissionError } from './errors/correction-errors';

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 직권 정정(요구사항 4.7-4) — HQ_HR만, 사유 필수, 근로자 통지, 감사로그로
 * 전량 추적(별도 테이블 없이 correction_report의 requestSource=ADMIN_DIRECT
 * 필터가 그 리포트 역할을 한다). 신청자 승인 절차 없이 즉시 최종 승인
 * 상태(APPROVED_L2)로 생성한다.
 */
@Injectable()
export class AdminCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly recalcTrigger: RecalculationTriggerService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(scope: OrgScope, principal: EmployeePrincipal, dto: AdminCorrectionDto): Promise<CorrectionRequest> {
    assertScope(scope);
    try {
      assertValidAfterValueForSubmission(dto.reasonCode, dto.afterValue);
    } catch (e) {
      throw new MalformedCorrectionPayloadSubmissionError((e as Error).message);
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: dto.employeeId },
      select: { primarySiteId: true },
    });
    await assertCorrectionTargetPeriodOpen(this.prisma, employee.primarySiteId, dto.targetWorkDate);

    const created = await this.prisma.correctionRequest.create({
      data: {
        employeeId: dto.employeeId,
        targetPunchId: dto.targetPunchId,
        targetWorkDate: dateOnly(dto.targetWorkDate),
        reasonCode: dto.reasonCode,
        reasonDetail: dto.reasonDetail,
        afterValue: dto.afterValue as never,
        evidenceUrl: dto.evidenceUrl,
        requestSource: 'ADMIN_DIRECT',
        status: 'APPROVED_L2',
      },
    });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'ADMIN_CORRECTION',
      resourceType: 'CorrectionRequest',
      resourceId: created.id,
      subjectEmployeeId: dto.employeeId,
      afterValue: { reasonCode: created.reasonCode, targetWorkDate: dto.targetWorkDate, afterValue: dto.afterValue },
      reason: dto.reasonDetail,
    });

    const targetWorkDateStr = toDateString(created.targetWorkDate);
    await this.recalcTrigger.onCorrectionApproved(dto.employeeId, targetWorkDateStr);
    await this.notificationService.notify('ADMIN_CORRECTION_APPLIED', dto.employeeId, {
      targetWorkDate: targetWorkDateStr,
      reason: dto.reasonDetail,
    });

    return created;
  }
}
