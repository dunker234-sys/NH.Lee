import { currentPrincipalStore } from '../auth/currentPrincipalStore';
import { pad2, seededRandom, sleep } from './mockUtils';
import { ApiResult, MonthSchedule, ScheduleApi, ScheduleDay, YearScheduleSummary } from './types';

const SHIFTS = [
  { name: '조식조', start: '05:00', end: '14:00' },
  { name: '중식조', start: '08:00', end: '17:00' },
  { name: '석식조', start: '11:00', end: '20:00' },
];

function seed(): () => number {
  return seededRandom(currentPrincipalStore.get()?.employeeNo ?? 'demo');
}

function buildMonthDays(year: number, month: number): ScheduleDay[] {
  const rand = seed();
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: ScheduleDay[] = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = `${year}-${pad2(month)}-${pad2(d)}`;
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    const isOff = dayOfWeek === 0 || rand() < 0.05; // 일요일 + 가끔 평일 휴무
    if (isOff) {
      days.push({ date, shiftName: null, plannedStartTime: null, plannedEndTime: null });
      continue;
    }
    const shift = SHIFTS[Math.floor(rand() * SHIFTS.length)];
    days.push({ date, shiftName: shift.name, plannedStartTime: shift.start, plannedEndTime: shift.end });
  }
  return days;
}

export const mockScheduleApi: ScheduleApi = {
  async getMonthSchedule(yearMonth): Promise<ApiResult<MonthSchedule>> {
    await sleep();
    const [year, month] = yearMonth.split('-').map(Number);
    return { data: { yearMonth, days: buildMonthDays(year, month) }, source: 'MOCK' };
  },

  async getYearSchedule(year): Promise<ApiResult<YearScheduleSummary>> {
    await sleep();
    const rand = seed();
    const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, scheduledDays: 18 + Math.floor(rand() * 8) }));
    return {
      data: { year, totalScheduledDays: byMonth.reduce((sum, m) => sum + m.scheduledDays, 0), byMonth },
      source: 'MOCK',
    };
  },
};
