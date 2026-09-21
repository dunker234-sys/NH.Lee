import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { monthRange } from '../../common/time/week.util';

export interface ScheduleVsActualRow {
  scheduleId: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  workDate: string;
  status: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  /** AttendanceDaily 산출 결과가 아직 없으면 null(단정하지 않는다 — 재계산 미실행/미래일 가능성). */
  actualExists: boolean;
  isAbsence: boolean | null;
  latenessMinutes: number | null;
  earlyLeaveMinutes: number | null;
  scheduledExcessMinutes: number | null;
  actualWorkMinutes: number | null;
}

/** 계획 대비 실적(요구사항6) — AttendanceDaily(STEP3 산출물)가 이미
 * lateness/earlyLeave/scheduledExcess/isAbsence를 계산해 두므로, 여기서
 * 재계산하지 않고 Schedule과 조인해 보여주기만 한다. */
@Injectable()
export class ScheduleReportService {
  constructor(private readonly prisma: PrismaService) {}

  async scheduleVsActual(scope: OrgScope, siteId: string, yearMonth: string): Promise<ScheduleVsActualRow[]> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    const { start, end } = monthRange(yearMonth);

    const [schedules, dailies] = await Promise.all([
      this.prisma.schedule.findMany({
        where: { siteId, workDate: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
        include: { employee: { select: { employeeNo: true, name: true } } },
        orderBy: [{ workDate: 'asc' }, { employeeId: 'asc' }],
      }),
      this.prisma.attendanceDaily.findMany({ where: { siteId, workDate: { gte: start, lt: end } } }),
    ]);

    const dailyByKey = new Map(dailies.map((d) => [`${d.employeeId}:${d.workDate.toISOString().slice(0, 10)}`, d]));

    return schedules.map((s) => {
      const workDate = s.workDate.toISOString().slice(0, 10);
      const actual = dailyByKey.get(`${s.employeeId}:${workDate}`);
      return {
        scheduleId: s.id,
        employeeId: s.employeeId,
        employeeNo: s.employee.employeeNo,
        employeeName: s.employee.name,
        workDate,
        status: s.status,
        plannedStartAt: s.plannedStartAt,
        plannedEndAt: s.plannedEndAt,
        actualExists: actual != null,
        isAbsence: actual?.isAbsence ?? null,
        latenessMinutes: actual?.latenessMinutes ?? null,
        earlyLeaveMinutes: actual?.earlyLeaveMinutes ?? null,
        scheduledExcessMinutes: actual?.scheduledExcessMinutes ?? null,
        actualWorkMinutes: actual?.actualWorkMinutes ?? null,
      };
    });
  }
}
