import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditLog } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';

export interface AuditLogReportQuery {
  from: string;
  to: string;
  siteId?: string;
  employeeId?: string;
  actorPrincipal?: string;
  eventType?: string;
  page?: number;
  pageSize?: number;
}

/** AuditLog.seq는 BigInt라 JSON.stringify가 직렬화하지 못한다 — 응답 직전에 문자열로 바꾼다. */
export type SerializableAuditLog = Omit<AuditLog, 'seq'> & { seq: string };

function toSerializable(row: AuditLog): SerializableAuditLog {
  return { ...row, seq: row.seq.toString() };
}

/**
 * 요구사항 5의 "조회 화면: 기간·사업장·근로자·행위자 필터, 엑셀 내보내기".
 * audit_log에는 siteId 컬럼이 없으므로(resourceType이 다양해 일반적인
 * FK가 없다) "사업장" 필터는 그 사업장에 배정된 적 있는 employeeId 목록으로
 * subjectEmployeeId를 좁히는 근사 방식을 쓴다 — STEP7.5의 유사 리포트
 * 쿼리와 같은 수준의 근사다. SITE_MANAGER/REGIONAL(OrgScope=SITES)는
 * siteId를 필수로 강제하고, subjectEmployeeId가 NULL인 시스템/정책 레벨
 * 이벤트는 스코프가 ALL(HQ_HR/ADMIN)일 때만 노출한다.
 */
@Injectable()
export class AuditLogReportService {
  constructor(private readonly prisma: PrismaService) {}

  async query(scope: OrgScope, params: AuditLogReportQuery): Promise<SerializableAuditLog[]> {
    const where = await this.buildWhere(scope, params);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 100;
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { seq: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return rows.map(toSerializable);
  }

  async exportWorkbook(scope: OrgScope, params: AuditLogReportQuery): Promise<Buffer> {
    const where = await this.buildWhere(scope, params);
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { seq: 'desc' } });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('감사로그');
    sheet.addRow(['발생일시', '이벤트유형', '행위자', '행위자역할', '대상근로자ID', '리소스유형', '리소스ID', '사유']);
    for (const row of rows) {
      sheet.addRow([
        row.occurredAt.toISOString(),
        row.eventType,
        row.actorPrincipal,
        row.actorRole,
        row.subjectEmployeeId ?? '',
        row.resourceType,
        row.resourceId ?? '',
        row.reason ?? '',
      ]);
    }

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private async buildWhere(scope: OrgScope, params: AuditLogReportQuery) {
    assertScope(scope);

    if (scope.kind === 'SITES' && !params.siteId) {
      throw new BadRequestException({
        code: 'AUDIT_LOG_SITE_ID_REQUIRED',
        message: '사업장 관리자/권역 관리자는 siteId 파라미터가 필수입니다.',
      });
    }
    if (params.siteId) assertSiteInScope(scope, params.siteId);

    let subjectEmployeeIdIn: string[] | undefined;
    if (params.siteId) {
      const assignments = await this.prisma.employeeSiteAssignment.findMany({
        where: { siteId: params.siteId },
        select: { employeeId: true },
      });
      subjectEmployeeIdIn = assignments.map((a) => a.employeeId);
    }
    if (params.employeeId) {
      subjectEmployeeIdIn = subjectEmployeeIdIn ? subjectEmployeeIdIn.filter((id) => id === params.employeeId) : [params.employeeId];
    }

    // scope.kind === 'SITES'는 위에서 siteId를 필수로 강제했으므로 이 지점에
    // 도달했다면 subjectEmployeeIdIn이 항상 채워져 있다 — 시스템 레벨(subjectEmployeeId
    // NULL) 이벤트는 자연히 이 필터에서 걸러진다(HQ_HR/ADMIN만 별도 필터 없이 볼 수 있다).
    return {
      occurredAt: { gte: new Date(params.from), lte: new Date(params.to) },
      actorPrincipal: params.actorPrincipal,
      eventType: params.eventType,
      subjectEmployeeId: subjectEmployeeIdIn ? { in: subjectEmployeeIdIn } : undefined,
    };
  }
}
