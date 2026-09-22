import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './apiClient';

export interface SessionPrincipal {
  employeeId: string;
  employeeNo: string;
  role: string;
  status: string;
}

/** 역할 게이팅이 필요한 화면들이 공유하는 세션 조회 — /auth/session은 이미
 * 캐시 대상이라(staleTime 5분) 여러 화면에서 호출해도 중복 요청되지 않는다. */
export function usePrincipal() {
  return useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () => apiFetch<{ principal: SessionPrincipal }>('/auth/session'),
    staleTime: 5 * 60 * 1000,
  });
}
