import { INestApplication } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';

export interface ConcurrentPostItem {
  token: string;
  body: unknown;
}

export interface ConcurrentPostResult {
  status: number | null;
  elapsedMs: number;
}

/**
 * items를 전부 동시에 POST하고 요청별 소요시간을 돌려준다. 요청은 별도 Node 프로세스에서 쏜다 —
 * 서버와 같은 프로세스에서 supertest로 쏘면 클라이언트 CPU가 서버와 같은 이벤트 루프를 나눠 써서
 * 서버 처리 시간이 아니라 테스트 구조를 재게 된다(CI 러너 CPU 세대별로 P95가 크게 달라지던 원인).
 * app은 이미 listen 중이어야 한다.
 */
export async function postConcurrently(
  app: INestApplication,
  urlPath: string,
  items: ConcurrentPostItem[],
  timeoutMs = 30_000,
): Promise<ConcurrentPostResult[]> {
  const address = app.getHttpServer().address();
  if (!address || typeof address === 'string') {
    throw new Error('app.listen()으로 서버를 먼저 열어야 한다');
  }

  // 자식 프로세스 기동 시간을 측정에서 빼기 위해 약속 시각을 넉넉히 뒤로 잡는다.
  const startAt = Date.now() + 1500;
  const child = spawn(process.execPath, [path.join(__dirname, 'concurrent-post-client.js')], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stdin.end(JSON.stringify({ port: address.port, path: urlPath, startAt, items }));

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`부하 생성기가 ${timeoutMs}ms 안에 끝나지 않았다`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`부하 생성기가 비정상 종료했다(code=${code})`));
    });
  });

  return JSON.parse(stdout) as ConcurrentPostResult[];
}
