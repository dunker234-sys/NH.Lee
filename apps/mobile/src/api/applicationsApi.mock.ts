import * as Crypto from 'expo-crypto';
import { currentPrincipalStore } from '../auth/currentPrincipalStore';
import { seededRandom, sleep } from './mockUtils';
import { ApiResult, ApplicationRecord, ApplicationsApi } from './types';

function seed(): () => number {
  return seededRandom(currentPrincipalStore.get()?.employeeNo ?? 'demo');
}

const submitted: ApplicationRecord[] = [];

const KINDS: ApplicationRecord['kind'][] = ['CORRECTION', 'LEAVE', 'OVERTIME', 'DISPATCH'];
const SUMMARIES: Record<ApplicationRecord['kind'], string[]> = {
  CORRECTION: ['출근 시각 정정 신청', '퇴근 시각 정정 신청', '휴게 미부여 신고'],
  LEAVE: ['연차 신청', '반차 신청'],
  OVERTIME: ['사전 연장근로 승인 요청', '사후 연장근로 실적 신고'],
  DISPATCH: ['타 사업장 지원 요청', '외근 등록'],
};

export const mockApplicationsApi: ApplicationsApi = {
  async listApplications(): Promise<ApiResult<ApplicationRecord[]>> {
    await sleep();
    const rand = seed();
    const count = 4 + Math.floor(rand() * 4);
    const items: ApplicationRecord[] = Array.from({ length: count }, (_, i) => {
      const kind = KINDS[Math.floor(rand() * KINDS.length)];
      const summaries = SUMMARIES[kind];
      const status = rand() < 0.5 ? 'PENDING' : rand() < 0.8 ? 'APPROVED' : 'REJECTED';
      const daysAgo = i * 3 + Math.floor(rand() * 3);
      const submittedAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
      return {
        id: `mock-app-${i}`,
        kind,
        summary: summaries[Math.floor(rand() * summaries.length)],
        status,
        submittedAt,
        approvalStage: status === 'PENDING' ? '1차(사업장) 승인 대기' : undefined,
      };
    });
    return {
      data: [...submitted, ...items].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1)),
      source: 'MOCK',
    };
  },

  async submitCorrection(date, reason): Promise<ApiResult<ApplicationRecord>> {
    await sleep();
    const record: ApplicationRecord = {
      id: Crypto.randomUUID(),
      kind: 'CORRECTION',
      summary: `${date} 정정 신청 — ${reason}`,
      status: 'PENDING',
      submittedAt: new Date().toISOString(),
      approvalStage: '1차(사업장) 승인 대기',
    };
    submitted.push(record);
    return { data: record, source: 'MOCK' };
  },
};
