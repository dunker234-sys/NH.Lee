import { currentPrincipalStore } from '../auth/currentPrincipalStore';
import { seededRandom, sleep } from './mockUtils';
import { ApiResult, ComplianceApi, WeeklyComplianceGauge } from './types';

const LIMIT_MINUTES = 52 * 60; // policy_config의 52시간 한도를 목업에서는 상수로 고정(STEP9가 실제 값을 대체)

export const mockComplianceApi: ComplianceApi = {
  async getWeeklyGauge(weekStart): Promise<ApiResult<WeeklyComplianceGauge>> {
    await sleep();
    const rand = seededRandom((currentPrincipalStore.get()?.employeeNo ?? 'demo') + weekStart);
    const totalWorkMinutes = Math.floor(1200 + rand() * 1800); // 20~50시간대
    const workedTodayMinutes = Math.floor(rand() * 480);
    return {
      data: {
        weekStart,
        totalWorkMinutes,
        limitMinutes: LIMIT_MINUTES,
        workedTodayMinutes,
        todayShiftLabel: rand() > 0.2 ? '중식조 08:00~17:00' : null,
      },
      source: 'MOCK',
    };
  },
};
