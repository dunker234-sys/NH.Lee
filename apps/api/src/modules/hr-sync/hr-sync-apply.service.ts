import { Injectable } from '@nestjs/common';
import { AssignmentRole, EmployeeStatus, HrSyncBatchStatus, HrSyncRowChangeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { createTempPasswordHash } from '../../common/auth/temp-credential.util';
import { NormalizedHrRecord } from './hr-sync-normalizer';
import { ExistingEmployeeSnapshot } from './hr-sync-diff';

interface ApplyOptions {
  /** 관리자 승인 경로면 그 관리자 employeeId, 자동적용이면 null. */
  appliedBy: string | null;
  appliedByRole?: string;
  resultStatus: typeof HrSyncBatchStatus.AUTO_APPLIED | typeof HrSyncBatchStatus.APPLIED;
}

export interface HrSyncApplyResult {
  createdCount: number;
  updatedCount: number;
  departedCount: number;
}

/**
 * HrSyncBatchRow(이미 영속화된 diff 결과)를 실제 Employee 테이블에 반영한다.
 * 신규 입사자 계정 생성, 변경 반영(사업장 이동 시 PRIMARY 배정 마감+신규
 * 생성), 퇴사자 비활성화(데이터 보존, 삭제 없음)를 한 트랜잭션에서 처리한다.
 * 상위 결재자(managerId)는 2-pass로 해결한다 — 같은 배치 안에서 신규
 * 직원이 다른 신규 직원의 상위 결재자일 수 있기 때문이다.
 */
@Injectable()
export class HrSyncApplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async applyBatch(batchId: string, options: ApplyOptions): Promise<HrSyncApplyResult> {
    const batch = await this.prisma.hrSyncBatch.findUniqueOrThrow({ where: { id: batchId }, include: { rows: true } });

    const result = await this.prisma.$transaction(
      async (tx) => {
        let createdCount = 0;
        let updatedCount = 0;
        let departedCount = 0;
        const pendingManagerLinks: { employeeId: string; managerEmployeeNo: string }[] = [];

        for (const row of batch.rows) {
          if (row.changeType === HrSyncRowChangeType.NEW) {
            const after = row.afterValue as unknown as NormalizedHrRecord;
            const passwordHash = await createTempPasswordHash();

            const employee = await tx.employee.create({
              data: {
                employeeNo: after.employeeNo,
                name: after.name,
                employmentType: after.employmentType,
                hireDate: new Date(`${after.hireDate}T00:00:00.000Z`),
                resignationDate: after.resignationDate ? new Date(`${after.resignationDate}T00:00:00.000Z`) : null,
                status: EmployeeStatus.ACTIVE,
                primarySiteId: after.siteId,
                department: after.department,
                jobTitle: after.jobTitle,
                contractedWorkMinutes: after.contractedWorkMinutes,
                hrSourceEffectiveDate: new Date(`${after.effectiveDate}T00:00:00.000Z`),
                credential: { create: { passwordHash } },
              },
            });
            await tx.employeeSiteAssignment.create({
              data: {
                employeeId: employee.id,
                siteId: after.siteId,
                assignmentRole: AssignmentRole.PRIMARY,
                startDate: new Date(`${after.hireDate}T00:00:00.000Z`),
              },
            });
            if (after.managerEmployeeNo) {
              pendingManagerLinks.push({ employeeId: employee.id, managerEmployeeNo: after.managerEmployeeNo });
            }
            createdCount += 1;
          } else if (row.changeType === HrSyncRowChangeType.CHANGED) {
            const before = row.beforeValue as unknown as ExistingEmployeeSnapshot;
            const after = row.afterValue as unknown as NormalizedHrRecord;

            await tx.employee.update({
              where: { id: before.id },
              data: {
                name: after.name,
                employmentType: after.employmentType,
                primarySiteId: after.siteId,
                department: after.department,
                jobTitle: after.jobTitle,
                contractedWorkMinutes: after.contractedWorkMinutes,
                hrSourceEffectiveDate: new Date(`${after.effectiveDate}T00:00:00.000Z`),
              },
            });

            // 겸직/복수사업장(EmployeeSiteAssignment SECONDARY)은 건드리지
            // 않는다 — PRIMARY 배정만 인사이동 반영 대상이다(요구사항서 5장⑤).
            if (before.siteId !== after.siteId) {
              await tx.employeeSiteAssignment.updateMany({
                where: { employeeId: before.id, assignmentRole: AssignmentRole.PRIMARY, endDate: null },
                data: { endDate: new Date(`${after.effectiveDate}T00:00:00.000Z`) },
              });
              await tx.employeeSiteAssignment.create({
                data: {
                  employeeId: before.id,
                  siteId: after.siteId,
                  assignmentRole: AssignmentRole.PRIMARY,
                  startDate: new Date(`${after.effectiveDate}T00:00:00.000Z`),
                },
              });
            }

            if (after.managerEmployeeNo !== before.managerEmployeeNo) {
              pendingManagerLinks.push({ employeeId: before.id, managerEmployeeNo: after.managerEmployeeNo ?? '' });
            }
            updatedCount += 1;
          } else if (row.changeType === HrSyncRowChangeType.DEPARTED) {
            const before = row.beforeValue as unknown as ExistingEmployeeSnapshot;
            const after = row.afterValue as unknown as { resignationDate: string };
            await tx.employee.update({
              where: { id: before.id },
              data: { status: EmployeeStatus.RESIGNED, resignationDate: new Date(`${after.resignationDate}T00:00:00.000Z`) },
            });
            departedCount += 1;
          }
          // ERROR 행은 이미 검증 단계에서 걸러졌으므로 여기서 건드리지 않는다.
        }

        // 2-pass: managerEmployeeNo → managerId. 같은 배치 안의 신규 직원끼리도
        // 상호참조를 해결할 수 있도록 employee 테이블을 다시 조회한다.
        if (pendingManagerLinks.length > 0) {
          const managerNos = [...new Set(pendingManagerLinks.map((l) => l.managerEmployeeNo).filter((n) => n !== ''))];
          const managers = await tx.employee.findMany({ where: { employeeNo: { in: managerNos } }, select: { id: true, employeeNo: true } });
          const managerIdByNo = new Map(managers.map((m) => [m.employeeNo, m.id]));
          for (const link of pendingManagerLinks) {
            const managerId = link.managerEmployeeNo ? (managerIdByNo.get(link.managerEmployeeNo) ?? null) : null;
            await tx.employee.update({ where: { id: link.employeeId }, data: { managerId } });
          }
        }

        await tx.hrSyncBatch.update({
          where: { id: batchId },
          data: {
            status: options.resultStatus,
            appliedAt: new Date(),
            reviewedBy: options.appliedBy ?? undefined,
          },
        });

        return { createdCount, updatedCount, departedCount };
      },
      { timeout: 30000 },
    );

    await this.auditLog.write({
      actorPrincipal: options.appliedBy ?? 'SYSTEM',
      actorRole: options.appliedByRole ?? (options.appliedBy ? 'HQ_HR' : 'SYSTEM'),
      eventType: 'HR_SYNC_BATCH_APPLIED',
      resourceType: 'HrSyncBatch',
      resourceId: batchId,
      afterValue: result as unknown as Prisma.InputJsonValue,
      scopeBypassed: !options.appliedBy,
    });

    return result;
  }

  async rejectBatch(batchId: string, reviewedBy: string): Promise<void> {
    await this.prisma.hrSyncBatch.update({
      where: { id: batchId },
      data: { status: HrSyncBatchStatus.REJECTED, reviewedBy },
    });
    await this.auditLog.write({
      actorPrincipal: reviewedBy,
      actorRole: 'HQ_HR',
      eventType: 'HR_SYNC_BATCH_REJECTED',
      resourceType: 'HrSyncBatch',
      resourceId: batchId,
    });
  }
}
