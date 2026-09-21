import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { monthRange } from '../../common/time/week.util';

/** 트랜잭션 안(배타 잠금 재조회 등)과 밖 양쪽에서 재사용하기 위한 타입. */
type Db = PrismaService | Prisma.TransactionClient;

export interface PayrollCloseReadiness {
  blocked: boolean;
  unresolvedUnapprovedActualsCount: number;
  hasPendingCorrections: boolean;
  hasPendingAttendance: boolean;
  hasUnresolvedNoShows: boolean;
  reasons: string[];
}

/**
 * 마감 차단 목록(요구사항서 4.8①) — 승인 대기 정정, PENDING 근태, 미등록 건,
 * 미승인 실적 미판정 건. 원래 STEP8이 만든 하나(미승인 실적)를 STEP11이
 * 여기로 이관하며 나머지 3개를 추가한다(헤더 주석에 STEP11이 확장해야 한다고
 * 명시돼 있었다).
 */
@Injectable()
export class PayrollCloseGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async hasUnresolvedUnapprovedActuals(siteId: string, yearMonth: string, db: Db = this.prisma): Promise<boolean> {
    return (await this.unresolvedCount(siteId, yearMonth, db)) > 0;
  }

  async unresolvedCount(siteId: string, yearMonth: string, db: Db = this.prisma): Promise<number> {
    const { start, end } = monthRange(yearMonth);
    return db.attendanceDaily.count({
      where: { siteId, status: 'UNAPPROVED_ACTUAL', workDate: { gte: start, lt: end } },
    });
  }

  async hasPendingCorrections(siteId: string, yearMonth: string, db: Db = this.prisma): Promise<boolean> {
    const { start, end } = monthRange(yearMonth);
    const count = await db.correctionRequest.count({
      where: {
        status: 'PENDING',
        targetWorkDate: { gte: start, lt: end },
        employee: { primarySiteId: siteId },
      },
    });
    return count > 0;
  }

  async hasPendingAttendance(siteId: string, yearMonth: string, db: Db = this.prisma): Promise<boolean> {
    const { start, end } = monthRange(yearMonth);
    const count = await db.attendanceDaily.count({
      where: { siteId, status: 'PENDING', workDate: { gte: start, lt: end } },
    });
    return count > 0;
  }

  /**
   * NoShowNotificationTarget에는 "해소됨" 플래그가 없다(STEP4 이후 미도입) —
   * 그날 실제 실적(actualWorkMinutes>0) 또는 결근 판정(isAbsence)이 attendance_daily에
   * 남아 있으면 이미 해소된 것으로 간주한다. 이 파생 판정 방식은 STEP11 계획
   * 수립 시 명시적으로 검토·확정한 결정이다.
   */
  async hasUnresolvedNoShows(siteId: string, yearMonth: string, db: Db = this.prisma): Promise<boolean> {
    const { start, end } = monthRange(yearMonth);
    const targets = await db.noShowNotificationTarget.findMany({
      where: { siteId, workDate: { gte: start, lt: end } },
      select: { employeeId: true, workDate: true },
    });
    if (targets.length === 0) return false;

    const resolved = await db.attendanceDaily.findMany({
      where: {
        siteId,
        workDate: { gte: start, lt: end },
        OR: [{ actualWorkMinutes: { gt: 0 } }, { isAbsence: true }],
      },
      select: { employeeId: true, workDate: true },
    });
    const resolvedKeys = new Set(resolved.map((r) => `${r.employeeId}:${r.workDate.toISOString()}`));
    return targets.some((t) => !resolvedKeys.has(`${t.employeeId}:${t.workDate.toISOString()}`));
  }

  async readiness(siteId: string, yearMonth: string, db: Db = this.prisma): Promise<PayrollCloseReadiness> {
    const [unresolvedUnapprovedActualsCount, pendingCorrections, pendingAttendance, unresolvedNoShows] = await Promise.all([
      this.unresolvedCount(siteId, yearMonth, db),
      this.hasPendingCorrections(siteId, yearMonth, db),
      this.hasPendingAttendance(siteId, yearMonth, db),
      this.hasUnresolvedNoShows(siteId, yearMonth, db),
    ]);

    const reasons: string[] = [];
    if (unresolvedUnapprovedActualsCount > 0) reasons.push(`미승인 실적 미판정 ${unresolvedUnapprovedActualsCount}건`);
    if (pendingCorrections) reasons.push('승인 대기 정정 존재');
    if (pendingAttendance) reasons.push('PENDING 근태 존재');
    if (unresolvedNoShows) reasons.push('미등록(무단결근 미해소) 건 존재');

    return {
      blocked: reasons.length > 0,
      unresolvedUnapprovedActualsCount,
      hasPendingCorrections: pendingCorrections,
      hasPendingAttendance: pendingAttendance,
      hasUnresolvedNoShows: unresolvedNoShows,
      reasons,
    };
  }
}
