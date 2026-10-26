// 부하 생성기 — 테스트(서버)와 별도의 Node 프로세스에서 요청을 동시에 쏜다.
// test/setup/external-load.ts가 spawn한다. 서버와 같은 프로세스에서 supertest로 쏘면 클라이언트 쪽
// CPU가 서버와 같은 이벤트 루프를 나눠 써서 서버 처리 시간이 아니라 "테스트 구조"를 재게 된다.
//
// stdin : JSON { port, path, startAt(epoch ms), items: [{ token, body }] }
// stdout: JSON [{ status, elapsedMs }]  (items와 같은 순서; 연결 오류면 status가 null)
const http = require('http');
const { performance } = require('perf_hooks');

let raw = '';
process.stdin.on('data', (d) => {
  raw += d;
});
process.stdin.on('end', () => {
  const cfg = JSON.parse(raw);
  const results = new Array(cfg.items.length);
  let done = 0;
  const finish = () => {
    if (++done === cfg.items.length) process.stdout.write(JSON.stringify(results));
  };

  const fire = () => {
    cfg.items.forEach((item, i) => {
      const body = JSON.stringify(item.body);
      const t0 = performance.now();
      // agent:false — 요청마다 새 연결(supertest와 같은 방식)
      const req = http.request(
        {
          host: '127.0.0.1',
          port: cfg.port,
          path: cfg.path,
          method: 'POST',
          agent: false,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            authorization: 'Bearer ' + item.token,
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => {
            results[i] = { status: res.statusCode, elapsedMs: performance.now() - t0 };
            finish();
          });
        },
      );
      req.on('error', () => {
        results[i] = { status: null, elapsedMs: performance.now() - t0 };
        finish();
      });
      req.end(body);
    });
  };

  // 프로세스 기동·JSON 파싱 비용이 측정에 섞이지 않도록 약속된 시각까지 기다렸다가 한꺼번에 쏜다.
  setTimeout(fire, Math.max(0, cfg.startAt - Date.now()));
});
