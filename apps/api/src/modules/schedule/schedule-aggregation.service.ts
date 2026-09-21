import { Injectable } from '@nestjs/common';
import { Schedule } from '@prisma/client';
import { FlexibleDailyTotal, WeeklyTotal } from '@attendance/core-rules';
import { RestGap } from '@attendance/core-rules';
import { PrismaService } from '../../common/prisma/prisma.service';
import { addDays, dateOnly, mondayOfWeek } from '../../common/time/week.util';
import { deriveWorkDateString } from '../../common/time/work-date.util';

/**
 * Schedule[] → core-rules 입력 형태(WeeklyTotal[]/FlexibleDailyTotal[]/
 * RestGap[]/workDates[]) 변환. DB 조회(경계 밖 lookback/lookahead 포함)가
 * 필요해 core-rules 밖(apps/api)에 둔다 — core-rules는 DB를 모른다
 * (CLAUDE.md 절대 규칙4의 "입력은 전부 인자로 주입" 원칙).
 */
@Injectable()
export class ScheduleAggregationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * targetFrom~targetTo를 padDays만큼 앞뒤로 확장해 조회한다 — 주 단위
   * 합산은 ISO 주 경계를 온전히 포함해야 하고, 연속근무일/휴식간격 검사는
   * 창 밖으로 이어지는 run을 놓치면 안 되기 때문이다.
   */
  async fetchEmployeeWindow(employeeId: string, targetFrom: string, targetTo: string, padDays = 14): Promise<Schedule[]> {
    const from = dateOnly(addDays(targetFrom, -padDays));
    const to = dateOnly(addDays(targetTo, padDays));
    return this.prisma.schedule.findMany({
      where: { employeeId, status: { not: 'CANCELLED' }, workDate: { gte: from, lte: to } },
      orderBy: { plannedStartAt: 'asc' },
    });
  }

  buildWorkDates(rows: Schedule[]): string[] {
    return [...new Set(rows.map((r) => deriveWorkDateString(r.plannedStartAt)))].sort();
  }

  buildDailyTotals(rows: Schedule[]): FlexibleDailyTotal[] {
    return rows.map((r) => ({
      date: deriveWorkDateString(r.plannedStartAt),
      totalMinutes: Math.max(0, Math.floor((r.plannedEndAt.getTime() - r.plannedStartAt.getTime()) / 60000) - r.plannedBreakMinutes),
    }));
  }

  buildWeeklyTotals(rows: Schedule[]): WeeklyTotal[] {
    const byWeek = new Map<string, number>();
    for (const r of this.buildDailyTotals(rows)) {
      const week = mondayOfWeek(r.date);
      byWeek.set(week, (byWeek.get(week) ?? 0) + r.totalMinutes);
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStartDate, totalMinutes]) => ({ weekStartDate, totalMinutes }));
  }

  /** 근무일 사이 실제 휴식 간격(직전 근무 종료 → 다음 근무 시작). 같은 날 여러
   * 행(교대 걸침 등)은 시각순으로 이미 정렬돼 있어 자연히 순서대로 계산된다. */
  buildRestGaps(rows: Schedule[]): RestGap[] {
    const gaps: RestGap[] = [];
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      const gapMinutes = Math.floor((cur.plannedStartAt.getTime() - prev.plannedEndAt.getTime()) / 60000);
      if (gapMinutes < 0) continue; // 겹치는 배정 — 별도 검증 대상, 여기서는 무시
      gaps.push({ afterWorkDate: deriveWorkDateString(prev.plannedStartAt), gapMinutes });
    }
    return gaps;
  }
}
