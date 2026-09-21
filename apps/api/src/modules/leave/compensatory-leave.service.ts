import { Injectable } from '@nestjs/common';
import { CompensatoryLeaveConversion } from '@prisma/client';
import { convertOvertimeToCompensatoryLeave } from '@attendance/core-rules';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/time/week.util';
import { NotificationService } from '../notifications/notification.service';
import { OvertimeSourceCategory } from './dto/convert-compensatory-leave.dto';
import { CompensatoryLeaveAgreementService } from './compensatory-leave-agreement.service';
import { CompensatoryLeaveAgreementMissingError, CompensatoryLeaveAlreadyConvertedError } from './errors/leave-errors';

const STANDARD_WORKDAY_MINUTES = 480; // 8h — 보상휴가 분→일 환산 표시용 기준(운영값이 아니라 표시 목적)

@Injectable()
export class CompensatoryLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly agreementService: CompensatoryLeaveAgreementService,
  ) {}

  async convert(
    principal: EmployeePrincipal,
    dto: { employeeId: string; sourceOvertimeRequestId: string; sourceCategory: OvertimeSourceCategory },
  ): Promise<CompensatoryLeaveConversion> {
    const [employee, overtimeRequest] = await Promise.all([
      this.prisma.employee.findUniqueOrThrow({ where: { id: dto.employeeId }, select: { primarySiteId: true } }),
      this.prisma.overtimeRequest.findUniqueOrThrow({ where: { id: dto.sourceOvertimeRequestId } }),
    ]);

    const hasAgreement = await this.agreementService.hasActiveAgreement(employee.primarySiteId, overtimeRequest.targetDate);
    if (!hasAgreement) throw new CompensatoryLeaveAgreementMissingError();

    const existing = await this.prisma.compensatoryLeaveConversion.findUnique({
      where: { sourceOvertimeRequestId: dto.sourceOvertimeRequestId },
    });
    if (existing) throw new CompensatoryLeaveAlreadyConvertedError(dto.sourceOvertimeRequestId);

    const policy = await this.resolvePremiumPolicy(employee.primarySiteId, overtimeRequest.targetDate);
    const { compensatoryLeaveMinutes, appliedPremiumRate } = convertOvertimeToCompensatoryLeave(
      { sourceMinutes: overtimeRequest.expectedMinutes, sourceCategory: dto.sourceCategory },
      policy,
    );

    const leaveType = await this.prisma.leaveType.findFirst({ where: { category: 'COMPENSATORY' } });
    if (!leaveType) {
      throw new Error('category=COMPENSATORY인 LeaveType이 없습니다. 먼저 POST /admin/leave/types로 생성하세요.');
    }
    const sourceWorkDateStr = overtimeRequest.targetDate.toISOString().slice(0, 10);
    const referencePeriod = sourceWorkDateStr.slice(0, 4);
    const grantedDaysDelta = Math.round((compensatoryLeaveMinutes / STANDARD_WORKDAY_MINUTES) * 100) / 100;

    const balance = await this.prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_referencePeriod: { employeeId: dto.employeeId, leaveTypeId: leaveType.id, referencePeriod } },
      create: {
        employeeId: dto.employeeId,
        leaveTypeId: leaveType.id,
        referencePeriod,
        effectiveDate: dateOnly(sourceWorkDateStr),
        expiryDate: dateOnly(`${Number(referencePeriod) + 1}-12-31`),
        grantedDays: grantedDaysDelta,
        basis: { reasonCode: 'COMPENSATORY_LEAVE_CONVERSION' } as never,
      },
      update: { grantedDays: { increment: grantedDaysDelta } },
    });

    const conversion = await this.prisma.compensatoryLeaveConversion.create({
      data: {
        employeeId: dto.employeeId,
        sourceOvertimeRequestId: dto.sourceOvertimeRequestId,
        sourceWorkDate: overtimeRequest.targetDate,
        sourceCategory: dto.sourceCategory,
        sourceMinutes: overtimeRequest.expectedMinutes,
        appliedPremiumRate,
        compensatoryLeaveMinutes,
        leaveBalanceId: balance.id,
        convertedBy: principal.employeeId,
      },
    });

    await this.auditLog.write({
      actorPrincipal: principal.employeeId,
      actorRole: principal.role,
      eventType: 'COMPENSATORY_LEAVE_CONVERTED',
      resourceType: 'CompensatoryLeaveConversion',
      resourceId: conversion.id,
      afterValue: { compensatoryLeaveMinutes, appliedPremiumRate: appliedPremiumRate.toString() },
    });
    await this.notificationService.notify('COMPENSATORY_LEAVE_CONVERTED', dto.employeeId, { compensatoryLeaveMinutes });

    return conversion;
  }

  /** overtimePremiumRate 등은 이미 여러 리졸버(schedule-policy-resolver 등)가
   * 각자 recalculation-policy-defaults.ts의 같은 키를 읽는 의도된 중복
   * 패턴이다(punch-policy-resolver.service.ts 헤더 주석 참고) — 이 서비스도
   * 그 관례를 따라 직접 조회한다. */
  private async resolvePremiumPolicy(siteId: string, asOfDate: Date) {
    const rows = await this.prisma.policyConfig.findMany({
      where: {
        key: { in: ['overtimePremiumRate', 'nightPremiumRate', 'holidayPremiumRateWithin8h', 'holidayPremiumRateExcess8h'] },
        AND: [
          { OR: [{ siteId }, { siteId: null }] },
          { effectiveStartDate: { lte: asOfDate } },
          { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }] },
        ],
      },
      orderBy: { effectiveStartDate: 'desc' },
    });
    const bestValueByKey = new Map<string, number>();
    for (const row of rows) {
      if (row.siteId === siteId && !bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value as unknown as number);
    }
    for (const row of rows) {
      if (row.siteId === null && !bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value as unknown as number);
    }
    const requiredKeys = ['overtimePremiumRate', 'nightPremiumRate', 'holidayPremiumRateWithin8h', 'holidayPremiumRateExcess8h'];
    for (const key of requiredKeys) {
      if (!bestValueByKey.has(key)) {
        throw new Error(`정책값 '${key}'를 policy_config에서 찾을 수 없습니다 — CLAUDE.md 절대 규칙4.`);
      }
    }
    return {
      overtimePremiumRate: bestValueByKey.get('overtimePremiumRate')!,
      nightPremiumRate: bestValueByKey.get('nightPremiumRate')!,
      holidayPremiumRateWithin8h: bestValueByKey.get('holidayPremiumRateWithin8h')!,
      holidayPremiumRateExcess8h: bestValueByKey.get('holidayPremiumRateExcess8h')!,
    };
  }
}
