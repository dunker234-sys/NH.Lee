import type { CreatePunchInput, CreatePunchResult } from '@attendance/shared-types';
import { apiFetch } from '../apiClient';

/** 기존(STEP4) POST /punches를 그대로 쓴다 — PC 전용 신규 엔드포인트가
 * 아니다. registrationMethod:'PC' + IpAllowlistGuard가 이 위젯의 유일한
 * 신규 배선이다(STEP5-B). */
export const punchApi = {
  create(input: CreatePunchInput): Promise<CreatePunchResult> {
    return apiFetch('/punches', { method: 'POST', body: input });
  },
};
