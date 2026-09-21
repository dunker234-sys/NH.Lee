import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { monthRange } from '../../common/time/week.util';

/**
 * 마감 차단 가드 — 미승인 실적이 남아 있으면 STEP11의 마감(PayrollClose)이
 * 이 서비스를 주입해 호출해야 한다(헤더 주석에 명시, 지금은 이 STEP에
 * close 엔드포인트 자체가 없다). 지금 당장은 읽기 전용 준비상태 엔드포인트로만
 * 검증 가능하게 노출한다(payroll-close-readiness.controller.ts).
 */
@Injectable()
export class PayrollCloseGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async hasUnresolvedUnapprovedActuals(siteId: string, yearMonth: string): Promise<boolean> {
    const { start, end } = monthRange(yearMonth);
    const count = await this.prisma.attendanceDaily.count({
      where: { siteId, status: 'UNAPPROVED_ACTUAL', workDate: { gte: start, lt: end } },
    });
    return count > 0;
  }

  async unresolvedCount(siteId: string, yearMonth: string): Promise<number> {
    const { start, end } = monthRange(yearMonth);
    return this.prisma.attendanceDaily.count({
      where: { siteId, status: 'UNAPPROVED_ACTUAL', workDate: { gte: start, lt: end } },
    });
  }
}
