import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface LoginResult {
  accessToken: string;
  deviceTrust: boolean;
}

/** 모든 STEP4 e2e 스펙이 공유하는 로그인 헬퍼 — 실제 /auth/login을 태워 토큰을 얻는다. */
export async function login(
  app: INestApplication,
  employeeNo: string,
  password: string,
  deviceId: string,
): Promise<LoginResult> {
  const res = await request(app.getHttpServer()).post('/auth/login').send({ employeeNo, password, deviceId });
  if (res.status !== 200) {
    throw new Error(`로그인 실패(${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { accessToken: res.body.accessToken as string, deviceTrust: res.body.deviceTrust as boolean };
}
