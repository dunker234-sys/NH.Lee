import { Injectable } from '@nestjs/common';
import { Schedule } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { monthRange } from '../../common/time/week.util';

@Injectable()
export class ScheduleMeService {
  constructor(private readonly prisma: PrismaService) {}

  monthly(employeeId: string, yearMonth: string): Promise<Schedule[]> {
    const { start, end } = monthRange(yearMonth);
    return this.prisma.schedule.findMany({
      where: { employeeId, workDate: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      orderBy: { workDate: 'asc' },
    });
  }

  yearly(employeeId: string, year: number): Promise<Schedule[]> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    return this.prisma.schedule.findMany({
      where: { employeeId, workDate: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      orderBy: { workDate: 'asc' },
    });
  }
}
