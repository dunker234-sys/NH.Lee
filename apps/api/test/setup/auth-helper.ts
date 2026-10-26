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

/**
 * 사전 준비용 대량 로그인 — 한 번에 chunkSize명씩만 동시에 태운다.
 * 로그인 1건은 트랜잭션(기기 바인딩, audit_log 해시체인 기록)을 여러 번 쓰는데, 2 vCPU
 * CI 러너에서 100명을 한꺼번에 쏘면 커넥션 풀 대기가 초과돼("Unable to start a transaction
 * in the given time") 500이 나고 앱이 정상 종료되지 않는다. 측정 구간 밖의 준비 단계라
 * 동시성을 낮춰도 P95 측정 조건(타각 동시 요청 수)은 달라지지 않는다.
 */
export async function loginInChunks(
  app: INestApplication,
  users: { employeeNo: string; password: string; deviceId: string }[],
  chunkSize = 10,
): Promise<LoginResult[]> {
  const results: LoginResult[] = [];
  for (let i = 0; i < users.length; i += chunkSize) {
    const chunk = users.slice(i, i + chunkSize);
    // eslint-disable-next-line no-await-in-loop
    results.push(...(await Promise.all(chunk.map((u) => login(app, u.employeeNo, u.password, u.deviceId)))));
  }
  return results;
}
