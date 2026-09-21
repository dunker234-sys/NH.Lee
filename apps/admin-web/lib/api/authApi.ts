import { apiFetch } from '../apiClient';

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

/** 기존(STEP2) POST /auth/login을 그대로 재사용한다 — 새 인증 방식 없음. */
export const authApi = {
  login(input: LoginInput): Promise<LoginResult> {
    return apiFetch('/auth/login', { method: 'POST', body: input });
  },
};
