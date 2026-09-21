import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HrSyncBatchStatus, HrSyncRowChangeType, HrSyncTriggerType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { HrSyncPolicyResolverService } from '../../common/policy/hr-sync-policy-resolver.service';
import { NotificationService } from '../notifications/notification.service';
import { HR_SOURCE_ADAPTER } from './hr-sync.types';
import type { HrSourceAdapter } from './hr-sync.types';
import { diffHrRecords, ExistingEmployeeSnapshot, HrSyncDiffEntry } from './hr-sync-diff';
import { normalizeHrRecords } from './hr-sync-normalizer';
import { HrSyncApplyService } from './hr-sync-apply.service';

export interface HrSyncPreviewEntry {
  employeeNo: string;
  changeType: 'NEW' | 'CHANGED' | 'DEPARTED';
  before?: unknown;
  after?: unknown;
}

export interface HrSyncRunSummary {
  batchId: string | null;
  status: HrSyncBatchStatus | 'DRY_RUN';
  sourceAdapterType: string;
  totalCount: number;
  newCount: number;
  changedCount: number;
  departedCount: number;
  errorCount: number;
  changeRatio: number;
  entries: HrSyncPreviewEntry[];
  rowErrors: { employeeNo: string; message: string }[];
}

/**
 * STEP10 동기화 엔진. dry-run과 실제 배치(run)가 1~3단계(조회→정규화→diff)를
 * 그대로 공유하고, run만 4단계 이후(영속화·자동적용/보류)를 더 수행한다 —
 * 두 경로가 갈라지면 "dry-run에서는 안 보이던 변경이 실제 배치에서 나타나는"
 * 류의 불일치가 생기기 쉬워, 공유 가능한 만큼 공유한다.
 */
@Injectable()
export class HrSyncService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(HR_SOURCE_ADAPTER) private readonly adapter: HrSourceAdapter,
    private readonly policyResolver: HrSyncPolicyResolverService,
    private readonly applyService: HrSyncApplyService,
    private readonly notificationService: NotificationService,
    private readonly auditLog: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  async dryRun(asOfDate: string): Promise<HrSyncRunSummary> {
    const { normalized, rowErrors, entries } = await this.fetchAndDiff(asOfDate);
    const currentHeadcount = await this.currentActiveHeadcount();
    const changeRatio = this.computeChangeRatio(entries, currentHeadcount);

    return {
      batchId: null,
      status: 'DRY_RUN',
      sourceAdapterType: this.adapterTypeName(),
      totalCount: normalized.length + rowErrors.length,
      newCount: entries.filter((e) => e.changeType === 'NEW').length,
      changedCount: entries.filter((e) => e.changeType === 'CHANGED').length,
      departedCount: entries.filter((e) => e.changeType === 'DEPARTED').length,
      errorCount: rowErrors.length,
      changeRatio,
      entries: entries.map((e) => this.toPreviewEntry(e)),
      rowErrors,
    };
  }

  /** SYSTEM 야간 배치와 관리자 수동 즉시실행 모두 이 메서드를 탄다(컨슈머가 진입점). */
  async run(asOfDate: string, triggeredBy: HrSyncTriggerType): Promise<HrSyncRunSummary> {
    const { normalized, rowErrors, entries } = await this.fetchAndDiff(asOfDate);
    const currentHeadcount = await this.currentActiveHeadcount();
    const changeRatio = this.computeChangeRatio(entries, currentHeadcount);
    const policy = await this.policyResolver.resolve(new Date());
    const requiresReview = changeRatio >= policy.hrSyncAutoApplyChangeRatioThreshold;

    const batch = await this.prisma.hrSyncBatch.create({
      data: {
        triggeredBy,
        status: requiresReview ? HrSyncBatchStatus.PENDING_REVIEW : HrSyncBatchStatus.AUTO_APPLIED,
        sourceAdapterType: this.adapterTypeName(),
        totalCount: normalized.length + rowErrors.length,
        newCount: entries.filter((e) => e.changeType === 'NEW').length,
        changedCount: entries.filter((e) => e.changeType === 'CHANGED').length,
        departedCount: entries.filter((e) => e.changeType === 'DEPARTED').length,
        errorCount: rowErrors.length,
        changeRatio,
      },
    });

    await this.persistRows(batch.id, entries, rowErrors, asOfDate);

    if (requiresReview) {
      await this.notifyReviewRequired(batch.id, {
        changeRatio,
        newCount: batch.newCount,
        changedCount: batch.changedCount,
        departedCount: batch.departedCount,
        errorCount: batch.errorCount,
      });
      return this.toSummary(batch.id);
    }

    await this.applyService.applyBatch(batch.id, { appliedBy: null, resultStatus: HrSyncBatchStatus.AUTO_APPLIED });
    return this.toSummary(batch.id);
  }

  private async fetchAndDiff(asOfDate: string) {
    const records = await this.adapter.fetchAll(asOfDate);
    const sites = await this.prisma.site.findMany({ select: { id: true, code: true } });
    const siteCodeToId = new Map(sites.map((s) => [s.code, s.id]));
    const { normalized, rowErrors } = normalizeHrRecords(records, siteCodeToId);

    const existing = await this.loadExistingSnapshots();
    const { entries } = diffHrRecords(normalized, existing);
    return { normalized, rowErrors, entries };
  }

  private async loadExistingSnapshots(): Promise<Map<string, ExistingEmployeeSnapshot>> {
    const employees = await this.prisma.employee.findMany({
      where: { status: { in: ['ACTIVE', 'ON_LEAVE'] } },
      include: { manager: { select: { employeeNo: true } } },
    });
    const map = new Map<string, ExistingEmployeeSnapshot>();
    for (const e of employees) {
      map.set(e.employeeNo, {
        id: e.id,
        employeeNo: e.employeeNo,
        name: e.name,
        siteId: e.primarySiteId,
        department: e.department,
        jobTitle: e.jobTitle,
        employmentType: e.employmentType,
        hireDate: e.hireDate.toISOString().slice(0, 10),
        resignationDate: e.resignationDate ? e.resignationDate.toISOString().slice(0, 10) : null,
        contractedWorkMinutes: e.contractedWorkMinutes,
        managerEmployeeNo: e.manager?.employeeNo ?? null,
        hrSourceEffectiveDate: e.hrSourceEffectiveDate ? e.hrSourceEffectiveDate.toISOString().slice(0, 10) : null,
        status: e.status,
      });
    }
    return map;
  }

  private async currentActiveHeadcount(): Promise<number> {
    return this.prisma.employee.count({ where: { status: { in: ['ACTIVE', 'ON_LEAVE'] } } });
  }

  private computeChangeRatio(entries: HrSyncDiffEntry[], currentHeadcount: number): number {
    if (currentHeadcount === 0) return entries.length > 0 ? 1 : 0;
    return Math.round((entries.length / currentHeadcount) * 10000) / 10000;
  }

  private async persistRows(
    batchId: string,
    entries: HrSyncDiffEntry[],
    rowErrors: { employeeNo: string; message: string }[],
    asOfDate: string,
  ): Promise<void> {
    const rows: Prisma.HrSyncBatchRowCreateManyInput[] = [];
    for (const entry of entries) {
      if (entry.changeType === 'NEW') {
        rows.push({ batchId, employeeNo: entry.employeeNo, changeType: HrSyncRowChangeType.NEW, afterValue: entry.after as unknown as Prisma.InputJsonValue });
      } else if (entry.changeType === 'CHANGED') {
        rows.push({
          batchId,
          employeeNo: entry.employeeNo,
          changeType: HrSyncRowChangeType.CHANGED,
          beforeValue: entry.before as unknown as Prisma.InputJsonValue,
          afterValue: entry.after as unknown as Prisma.InputJsonValue,
        });
      } else {
        rows.push({
          batchId,
          employeeNo: entry.employeeNo,
          changeType: HrSyncRowChangeType.DEPARTED,
          beforeValue: entry.before as unknown as Prisma.InputJsonValue,
          afterValue: { resignationDate: entry.resignationDate ?? asOfDate } as unknown as Prisma.InputJsonValue,
        });
      }
    }
    for (const err of rowErrors) {
      rows.push({ batchId, employeeNo: err.employeeNo, changeType: HrSyncRowChangeType.ERROR, errorMessage: err.message });
    }
    if (rows.length > 0) {
      await this.prisma.hrSyncBatchRow.createMany({ data: rows });
    }
  }

  private async notifyReviewRequired(
    batchId: string,
    payload: { changeRatio: number; newCount: number; changedCount: number; departedCount: number; errorCount: number },
  ): Promise<void> {
    const reviewers = await this.prisma.employee.findMany({
      where: { role: { in: ['HQ_HR', 'ADMIN'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    for (const reviewer of reviewers) {
      await this.notificationService.notify('HR_SYNC_REVIEW_REQUIRED', reviewer.id, { batchId, ...payload });
    }
    await this.auditLog.write({
      actorPrincipal: 'SYSTEM',
      actorRole: 'SYSTEM',
      eventType: 'HR_SYNC_REVIEW_REQUIRED',
      resourceType: 'HrSyncBatch',
      resourceId: batchId,
      afterValue: payload,
      scopeBypassed: true,
    });
  }

  private async toSummary(batchId: string): Promise<HrSyncRunSummary> {
    const batch = await this.prisma.hrSyncBatch.findUniqueOrThrow({ where: { id: batchId }, include: { rows: true } });
    return {
      batchId: batch.id,
      status: batch.status,
      sourceAdapterType: batch.sourceAdapterType,
      totalCount: batch.totalCount,
      newCount: batch.newCount,
      changedCount: batch.changedCount,
      departedCount: batch.departedCount,
      errorCount: batch.errorCount,
      changeRatio: batch.changeRatio.toNumber(),
      entries: batch.rows
        .filter((r) => r.changeType !== HrSyncRowChangeType.ERROR)
        .map((r) => ({ employeeNo: r.employeeNo, changeType: r.changeType as 'NEW' | 'CHANGED' | 'DEPARTED', before: r.beforeValue, after: r.afterValue })),
      rowErrors: batch.rows
        .filter((r) => r.changeType === HrSyncRowChangeType.ERROR)
        .map((r) => ({ employeeNo: r.employeeNo, message: r.errorMessage ?? '' })),
    };
  }

  private toPreviewEntry(entry: HrSyncDiffEntry): HrSyncPreviewEntry {
    if (entry.changeType === 'NEW') return { employeeNo: entry.employeeNo, changeType: 'NEW', after: entry.after };
    if (entry.changeType === 'CHANGED') return { employeeNo: entry.employeeNo, changeType: 'CHANGED', before: entry.before, after: entry.after };
    return { employeeNo: entry.employeeNo, changeType: 'DEPARTED', before: entry.before, after: { resignationDate: entry.resignationDate } };
  }

  private adapterTypeName(): string {
    return this.config.get<string>('hrSync.adapterType') ?? this.adapter.constructor.name;
  }
}
