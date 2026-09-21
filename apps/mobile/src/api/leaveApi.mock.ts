import * as Crypto from 'expo-crypto';
import { currentPrincipalStore } from '../auth/currentPrincipalStore';
import { seededRandom, sleep } from './mockUtils';
import { ApiResult, LeaveApi, LeaveBalance, LeaveRequest, LeaveRequestInput } from './types';

function seed(): () => number {
  return seededRandom(currentPrincipalStore.get()?.employeeNo ?? 'demo');
}

// 세션 동안만 유지되는 인메모리 목업 저장소 — 신청함/휴가 화면이 같은 데이터를 공유한다.
const submittedRequests: LeaveRequest[] = [];

export const mockLeaveApi: LeaveApi = {
  async getBalance(): Promise<ApiResult<LeaveBalance>> {
    await sleep();
    const rand = seed();
    const totalDays = 11 + Math.floor(rand() * 5); // 근기법 제60조 1년 미만~수년차 범위를 대충 흉내
    const usedDays = Math.floor(rand() * (totalDays - 2));
    return {
      data: {
        totalDays,
        usedDays,
        remainingDays: totalDays - usedDays,
        breakdown: [
          { label: '입사 1년 이상 근속연차', days: totalDays - 1 },
          { label: '가산연차(근속 2년당 1일)', days: 1 },
        ],
      },
      source: 'MOCK',
    };
  },

  async listRequests(): Promise<ApiResult<LeaveRequest[]>> {
    await sleep();
    if (submittedRequests.length === 0) {
      const rand = seed();
      submittedRequests.push({
        id: 'seed-1',
        leaveType: 'ANNUAL',
        startDate: '2026-07-14',
        endDate: '2026-07-14',
        days: 1,
        status: rand() > 0.5 ? 'APPROVED' : 'PENDING',
        requestedAt: '2026-07-10T09:00:00.000Z',
      });
    }
    return { data: [...submittedRequests].reverse(), source: 'MOCK' };
  },

  async submitRequest(input: LeaveRequestInput): Promise<ApiResult<LeaveRequest>> {
    await sleep();
    const days =
      (new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / 86400000 + 1;
    const request: LeaveRequest = {
      id: Crypto.randomUUID(),
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      days: input.leaveType === 'ANNUAL' ? days : input.leaveType === 'HALF_DAY' ? 0.5 : 0.25,
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    };
    submittedRequests.push(request);
    return { data: request, source: 'MOCK' };
  },
};
