import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface NoShowDetectionResult {
  createdCount: number;
}

function toDate(workDate: string): Date {
  return new Date(`${workDate}T00:00:00.000Z`);
}

/**
 * 계획근태(Schedule)는 있으나 실적(PunchRaw IN)이 없는 경우를 익일 자동
 * 감지한다. 실제 발송은 STEP4.5의 NotificationService 몫이라 여기서는
 * no_show_notification_target 행만 만든다.
 */
@Injectable()
export class NoShowDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  async detectForDate(workDate: string): Promise<NoShowDetectionResult> {
    const workDateObj = toDate(workDate);

    const schedules = await this.prisma.schedule.findMany({
      where: { status: 'CONFIRMED', workDate: workDateObj },
    });

    let createdCount = 0;
    for (const schedule of schedules) {
      const hasPunch = await this.prisma.punchRaw.findFirst({
        where: { employeeId: schedule.employeeId, workDate: workDateObj, punchType: 'IN' },
      });
      if (hasPunch) continue;

      // 반차/반반차는 부분 근무가 기대되므로 제외 대상에서 뺀다(문서화된 갭 — 범위를 좁힌 결정).
      const hasFullDayLeave = await this.prisma.leaveRequest.findFirst({
        where: {
          employeeId: schedule.employeeId,
          status: 'APPROVED',
          unit: 'FULL',
          startDate: { lte: workDateObj },
          endDate: { gte: workDateObj },
        },
      });
      if (hasFullDayLeave) continue;

      await this.prisma.noShowNotificationTarget.upsert({
        where: { employeeId_workDate: { employeeId: schedule.employeeId, workDate: workDateObj } },
        create: {
          employeeId: schedule.employeeId,
          siteId: schedule.siteId,
          workDate: workDateObj,
          scheduleId: schedule.id,
        },
        update: {},
      });
      createdCount += 1;
    }

    return { createdCount };
  }
}
