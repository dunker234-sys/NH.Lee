import { EmployeeRole } from '@attendance/shared-types';
import { apiFetch, refreshTokens } from './client';

export interface LoginInput {
  employeeNo: string;
  password: string;
  deviceId: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  deviceTrust: boolean;
  isNewDevice: boolean;
}

export interface EmployeePrincipal {
  kind: 'EMPLOYEE';
  employeeId: string;
  employeeNo: string;
  role: EmployeeRole;
  status: 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED';
}

/** apps/api의 실제 계약(POST /auth/login 등)을 그대로 감싼다 — 서버 응답 모양을 바꾸지 않는다. */
export const authApi = {
  login(input: LoginInput): Promise<LoginResult> {
    return apiFetch('/auth/login', { method: 'POST', body: input, skipAuth: true });
  },

  refresh: refreshTokens,

  changePassword(currentPassword: string, newPassword: string): Promise<{ success: true }> {
    return apiFetch('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
  },

  getSession(): Promise<{ principal: EmployeePrincipal }> {
    return apiFetch('/auth/session');
  },
};
