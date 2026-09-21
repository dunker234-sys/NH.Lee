import { currentPrincipalStore } from '../auth/currentPrincipalStore';
import { pad2, seededRandom, sleep } from './mockUtils';
import { ApiResult, AttendanceApi, AttendanceDayDetailData, AttendanceDaySummary, AttendanceDayStatus } from './types';

// STEP3(근로시간 계산엔진)/STEP8(정정) 결과를 읽는 실제 엔드포인트가 아직
// 없어 화면4(내 근태)도 목업이 필요하다 — scheduleApi.mock(계획 근태)과는
// 별개로, "실제로 무슨 일이 있었는지"를 흉내낸다.
const STATUS_WEIGHTS: [AttendanceDayStatus, number][] = [
  ['NORMAL', 0.78],
  ['LATE', 0.06],
  ['EARLY_LEAVE', 0.04],
  ['ABSENT', 0.02],
  ['HOLIDAY_WORK', 0.02],
];

function pickStatus(rand: () => number, isOff: boolean): AttendanceDayStatus {
  if (isOff) return rand() < 0.15 ? 'HOLIDAY_WORK' : 'NO_SCHEDULE';
  let r = rand();
  for (const [status, weight] of STATUS_WEIGHTS) {
    if (r < weight) return status;
    r -= weight;
  }
  return 'NORMAL';
}

function seed(extra = ''): () => number {
  return seededRandom((currentPrincipalStore.get()?.employeeNo ?? 'demo') + extra);
}

export const mockAttendanceApi: AttendanceApi = {
  async getMonthSummary(yearMonth): Promise<ApiResult<AttendanceDaySummary[]>> {
    await sleep();
    const [year, month] = yearMonth.split('-').map(Number);
    const rand = seed(yearMonth);
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

    const items: AttendanceDaySummary[] = [];
    for (let d = 1; d <= daysInMonth; d += 1) {
      if (isCurrentMonth && d > today.getDate()) break; // 미래 날짜는 아직 실적이 없다
      const date = `${year}-${pad2(month)}-${pad2(d)}`;
      const isOff = new Date(year, month - 1, d).getDay() === 0;
      const status = pickStatus(rand, isOff);
      const workedMinutes = status === 'NO_SCHEDULE' || status === 'ABSENT' ? 0 : 420 + Math.floor(rand() * 120);
      items.push({ date, status, workedMinutes });
    }
    return { data: items, source: 'MOCK' };
  },

  async getDayDetail(date): Promise<ApiResult<AttendanceDayDetailData>> {
    await sleep();
    const rand = seed(date);
    const status = pickStatus(rand, false);
    const workedMinutes = status === 'ABSENT' ? 0 : 420 + Math.floor(rand() * 120);
    return {
      data: {
        date,
        status,
        workedMinutes,
        punches:
          status === 'ABSENT'
            ? []
            : [
                { type: 'IN', recordedAt: `${date}T08:0${Math.floor(rand() * 9)}:00.000Z`, verificationLevel: 'NORMAL' },
                { type: 'OUT', recordedAt: `${date}T17:0${Math.floor(rand() * 9)}:00.000Z`, verificationLevel: 'NORMAL' },
              ],
        note: status === 'LATE' ? '5분 지각' : status === 'EARLY_LEAVE' ? '조퇴' : null,
      },
      source: 'MOCK',
    };
  },
};
