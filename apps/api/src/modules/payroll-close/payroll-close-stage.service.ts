import { ForbiddenException, Injectable } from '@nestjs/common';
import { EmployeeRole, PayrollClose } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { NotificationService } from '../notifications/notification.service';
import { monthRange } from '../../common/time/week.util';
import { PayrollCloseGuardService } from './payroll-close-guard.service';
import {
  PayrollCloseBlockedError,
  PayrollCloseReopenReasonRequiredError,
  PayrollCloseStageOrderError,
  PayrollCloseValidationRequiredError,
} from './errors/payroll-close-errors';

/**
 * 사업장→권역→본사 3단계 마감 상태 전이. 매 전이마다 (siteId,periodYearMonth)
 * 배타 잠금(device-binding.service.ts와 동일한 pg_advisory_xact_lock 패턴) 아래서
 * 미해결 항목을 재조회한 뒤에만 통과시킨다 — "마감 직전에 승인된 정정이
 * 누락되는 것을 방지"하는 요구사항을 문자 그대로 구현한다.
 *
 * PayrollClose.status(OPEN/CLOSED/RECLOSED)의 기존 의미는 건드리지 않는다 —
 * finalizeAtHq()만 유일하게 status를 CLOSED로 바꾼다.
 */
@Injectable()
export class PayrollCloseStageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: PayrollCloseGuardService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationService,
  ) {}

  private async lockKeyOf(siteId: string, periodYearMonth: string): Promise<string> {
    return `${siteId}:${periodYearMonth}`;
  }

  /** 조직 스코프와는 별개의 축 — "그 사업장 관할"이어도 단계에 맞는 역할이
   * 아니면 전이를 거부한다(CLAUDE.md "역할×스코프 이중 필터" 원칙). */
  private assertRole(actorRole: EmployeeRole, allowed: EmployeeRole[]): void {
    if (!allowed.includes(actorRole)) {
      throw new ForbiddenException({
        code: 'PAYROLL_CLOSE_ROLE_NOT_ALLOWED',
        message: `이 단계 전이는 ${allowed.join('/')} 역할만 수행할 수 있습니다.`,
      });
    }
  }

  async submitAtSite(siteId: string, periodYearMonth: string, actorEmployeeId: string, actorRole: EmployeeRole): Promise<PayrollClose> {
    this.assertRole(actorRole, ['SITE_MANAGER', 'ADMIN']);
    const result = await this.prisma.$transaction(async (tx) => {
      const lockKey = await this.lockKeyOf(siteId, periodYearMonth);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.payrollClose.findUnique({ where: { siteId_periodYearMonth: { siteId, periodYearMonth } } });
      const currentStage = existing?.stage ?? 'NOT_STARTED';
      if (currentStage !== 'NOT_STARTED') {
        throw new PayrollCloseStageOrderError(currentStage, 'NOT_STARTED');
      }

      const readiness = await this.guard.readiness(siteId, periodYearMonth, tx);
      if (readiness.blocked) {
        throw new PayrollCloseBlockedError(siteId, periodYearMonth, readiness.reasons);
      }

      return tx.payrollClose.upsert({
        where: { siteId_periodYearMonth: { siteId, periodYearMonth } },
        create: { siteId, periodYearMonth, stage: 'SITE_SUBMITTED', siteSubmittedAt: new Date(), siteSubmittedBy: actorEmployeeId },
        update: { stage: 'SITE_SUBMITTED', siteSubmittedAt: new Date(), siteSubmittedBy: actorEmployeeId },
      });
    });

    await this.auditLog.write({
      actorPrincipal: actorEmployeeId,
      actorRole,
      eventType: 'PAYROLL_CLOSE_SITE_SUBMITTED',
      resourceType: 'payroll_close',
      resourceId: result.id,
      afterValue: { siteId, periodYearMonth, stage: result.stage },
    });

    await this.notifyRegionalApprovers(siteId, periodYearMonth);
    return result;
  }

  async approveAtRegion(siteId: string, periodYearMonth: string, actorEmployeeId: string, actorRole: EmployeeRole): Promise<PayrollClose> {
    this.assertRole(actorRole, ['REGIONAL', 'ADMIN']);
    const result = await this.prisma.$transaction(async (tx) => {
      const lockKey = await this.lockKeyOf(siteId, periodYearMonth);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.payrollClose.findUnique({ where: { siteId_periodYearMonth: { siteId, periodYearMonth } } });
      const currentStage = existing?.stage ?? 'NOT_STARTED';
      if (currentStage !== 'SITE_SUBMITTED') {
        throw new PayrollCloseStageOrderError(currentStage, 'SITE_SUBMITTED');
      }

      const readiness = await this.guard.readiness(siteId, periodYearMonth, tx);
      if (readiness.blocked) {
        throw new PayrollCloseBlockedError(siteId, periodYearMonth, readiness.reasons);
      }

      return tx.payrollClose.update({
        where: { siteId_periodYearMonth: { siteId, periodYearMonth } },
        data: { stage: 'REGION_APPROVED', regionApprovedAt: new Date(), regionApprovedBy: actorEmployeeId },
      });
    });

    await this.auditLog.write({
      actorPrincipal: actorEmployeeId,
      actorRole,
      eventType: 'PAYROLL_CLOSE_REGION_APPROVED',
      resourceType: 'payroll_close',
      resourceId: result.id,
      afterValue: { siteId, periodYearMonth, stage: result.stage },
    });

    await this.notifyHqApprovers(siteId, periodYearMonth);
    return result;
  }

  async finalizeAtHq(siteId: string, periodYearMonth: string, actorEmployeeId: string, actorRole: EmployeeRole): Promise<PayrollClose> {
    this.assertRole(actorRole, ['HQ_HR', 'ADMIN']);
    const result = await this.prisma.$transaction(async (tx) => {
      const lockKey = await this.lockKeyOf(siteId, periodYearMonth);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.payrollClose.findUnique({ where: { siteId_periodYearMonth: { siteId, periodYearMonth } } });
      const currentStage = existing?.stage ?? 'NOT_STARTED';
      if (currentStage !== 'REGION_APPROVED' || !existing) {
        throw new PayrollCloseStageOrderError(currentStage, 'REGION_APPROVED');
      }

      const readiness = await this.guard.readiness(siteId, periodYearMonth, tx);
      if (readiness.blocked) {
        throw new PayrollCloseBlockedError(siteId, periodYearMonth, readiness.reasons);
      }

      if (!existing.lastValidationReportId) {
        throw new PayrollCloseValidationRequiredError('마감 전 자동 검증을 먼저 실행하고 확인해야 합니다.');
      }
      const report = await tx.payrollCloseValidationReport.findUnique({ where: { id: existing.lastValidationReportId } });
      if (!report || report.siteId !== siteId || report.periodYearMonth !== periodYearMonth) {
        throw new PayrollCloseValidationRequiredError('마감 전 자동 검증 리포트가 이 마감 대상과 일치하지 않습니다.');
      }
      if (!report.acknowledgedAt) {
        throw new PayrollCloseValidationRequiredError('마감 전 자동 검증 리포트를 아직 확인하지 않았습니다.');
      }
      if (report.blockingCount > 0) {
        throw new PayrollCloseValidationRequiredError(`차단 항목(${report.blockingCount}건)이 남아 있습니다.`);
      }

      // 사용자 확정: 본사 최종 마감 시 해당 기간 attendance_daily를 LOCKED로 일괄 전환한다.
      const { start, end } = monthRange(periodYearMonth);
      await tx.attendanceDaily.updateMany({
        where: { siteId, workDate: { gte: start, lt: end } },
        data: { status: 'LOCKED' },
      });

      // 최초 마감은 version=1 그대로 둔다 — closedAt이 이미 있었다면(=이전에
      // 한 번 마감→재개된 적이 있다면) 재마감이므로 그때만 버전을 올린다.
      const isReclose = existing.closedAt !== null;

      return tx.payrollClose.update({
        where: { siteId_periodYearMonth: { siteId, periodYearMonth } },
        data: {
          stage: 'HQ_FINALIZED',
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: actorEmployeeId,
          ...(isReclose ? { version: { increment: 1 } } : {}),
        },
      });
    });

    await this.auditLog.write({
      actorPrincipal: actorEmployeeId,
      actorRole,
      eventType: result.version > 1 ? 'PAYROLL_RECLOSE' : 'PAYROLL_CLOSE',
      resourceType: 'payroll_close',
      resourceId: result.id,
      afterValue: { siteId, periodYearMonth, stage: result.stage, version: result.version },
    });

    return result;
  }

  async reopen(siteId: string, periodYearMonth: string, actorEmployeeId: string, actorRole: EmployeeRole, reason: string): Promise<PayrollClose> {
    this.assertRole(actorRole, ['HQ_HR', 'ADMIN']);
    if (!reason?.trim()) {
      throw new PayrollCloseReopenReasonRequiredError();
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const lockKey = await this.lockKeyOf(siteId, periodYearMonth);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.payrollClose.findUnique({ where: { siteId_periodYearMonth: { siteId, periodYearMonth } } });
      if (!existing || existing.stage !== 'HQ_FINALIZED') {
        throw new PayrollCloseStageOrderError(existing?.stage ?? 'NOT_STARTED', 'HQ_FINALIZED');
      }

      return tx.payrollClose.update({
        where: { siteId_periodYearMonth: { siteId, periodYearMonth } },
        data: {
          stage: 'NOT_STARTED',
          status: 'OPEN',
          reopenedAt: new Date(),
          reopenedBy: actorEmployeeId,
          reopenReason: reason,
          // 재마감 전 검증을 다시 받도록 강제한다 — 재개 전 리포트를 그대로
          // 재사용해 finalize를 통과하는 것을 막는다.
          lastValidationReportId: null,
        },
      });
    });

    await this.auditLog.write({
      actorPrincipal: actorEmployeeId,
      actorRole,
      eventType: 'PAYROLL_CLOSE_REOPENED',
      resourceType: 'payroll_close',
      resourceId: result.id,
      reason,
      afterValue: { siteId, periodYearMonth, stage: result.stage },
    });

    return result;
  }

  private async notifyRegionalApprovers(siteId: string, periodYearMonth: string): Promise<void> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId }, select: { regionId: true } });
    if (!site) return;
    const regionSites = await this.prisma.site.findMany({ where: { regionId: site.regionId }, select: { id: true } });
    const recipients = await this.prisma.employee.findMany({
      where: { role: 'REGIONAL', status: 'ACTIVE', siteAssignments: { some: { siteId: { in: regionSites.map((s) => s.id) } } } },
      select: { id: true },
    });
    const targets = recipients.length > 0 ? recipients : await this.prisma.employee.findMany({ where: { role: 'HQ_HR', status: 'ACTIVE' }, select: { id: true } });
    for (const r of targets) {
      await this.notifications.notify('PAYROLL_CLOSE_SITE_SUBMITTED', r.id, { siteId, periodYearMonth });
    }
  }

  private async notifyHqApprovers(siteId: string, periodYearMonth: string): Promise<void> {
    const recipients = await this.prisma.employee.findMany({ where: { role: 'HQ_HR', status: 'ACTIVE' }, select: { id: true } });
    for (const r of recipients) {
      await this.notifications.notify('PAYROLL_CLOSE_REGION_APPROVED', r.id, { siteId, periodYearMonth });
    }
  }
}
