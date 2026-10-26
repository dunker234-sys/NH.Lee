// 진단용: 100건 동시 POST /punches(punches-p95와 같은 조건)가 시간을 어디에 쓰는지 단계별로 잰다.
// 통과/실패 기준(임계값)은 없다 — 수치를 출력만 한다. PROFILE_BURST=1일 때만 실행된다.
// 사용: PROFILE_BURST=1 pnpm exec jest --config test/jest-e2e.json --runInBand punch-burst-profile
//   PROFILE_PAUSE=1   측정 구간 동안 재계산/부정사용탐지 큐를 멈춘다(워커 경합 제거)
//   PROFILE_EXT=1     부하 생성기를 별도 프로세스로 돌린다(서버 이벤트 루프를 테스트 클라이언트와 분리)
//   PROFILE_CPU=1     버스트 구간 CPU 프로파일(패키지별 self 시간)
//   PROFILE_WARM=N    측정 전에 N건을 먼저 보내 경로를 달군다
//   TEST_DATABASE_URL connection_limit을 바꿔 풀 크기 영향을 본다
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Queue } from 'bullmq';
import * as os from 'os';
import { monitorEventLoopDelay, performance } from 'perf_hooks';
import request from 'supertest';
import * as inspector from 'inspector';
import { FRAUD_DETECTION_QUEUE_NAME } from '../src/modules/fraud-detection/queue.constants';
import { RECALCULATION_QUEUE_NAME } from '../src/modules/recalculation/queue.constants';
import { WEEKLY_RECALC_BATCH_QUEUE_NAME } from '../src/modules/recalculation/weekly-recalc-batch.queue.constants';
import { WEEKLY_ALERT_QUEUE_NAME } from '../src/modules/weekly-alert/queue.constants';
import { HR_SYNC_QUEUE_NAME } from '../src/modules/hr-sync/queue.constants';
import { NOTIFICATIONS_QUEUE_NAME } from '../src/modules/notifications/queue.constants';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PrincipalGuard } from '../src/common/guards/principal.guard';
import { IpAllowlistGuard } from '../src/modules/punches/guards/ip-allowlist.guard';
import { PunchesController } from '../src/modules/punches/punches.controller';
import { PunchesService } from '../src/modules/punches/punches.service';
import { PunchRawRepository } from '../src/common/punch/punch-raw.repository';
import { PunchPolicyResolverService } from '../src/common/policy/punch-policy-resolver.service';
import { RecalculationTriggerService } from '../src/modules/recalculation/recalculation-trigger.service';
import { FraudDetectionTriggerService } from '../src/modules/fraud-detection/fraud-detection-trigger.service';
import { AccessLogService } from '../src/common/access-log/access-log.service';
import { RecalculationService } from '../src/modules/recalculation/recalculation.service';
import { createTestApp } from './setup/app';
import { resetDatabase, adminPrisma } from './setup/db';
import { loginInChunks } from './setup/auth-helper';
import {
  Fixture,
  loadFixture,
  loadPolicyConfigFixture,
  loadPunchPolicyConfigFixture,
  loadSiteIpAllowlistFixture,
  loadWeeklyAlertPolicyConfigFixture,
} from './fixtures';

const N = 100;
const stages = new Map<string, number[]>();
function rec(label: string, ms: number) {
  const arr = stages.get(label) ?? [];
  arr.push(ms);
  stages.set(label, arr);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrap(proto: any, name: string, label: string) {
  const orig = proto[name];
  proto[name] = function (...args: unknown[]) {
    const t = performance.now();
    const r = orig.apply(this, args);
    if (r && typeof r.then === 'function') {
      return r.then(
        (v: unknown) => {
          rec(label, performance.now() - t);
          return v;
        },
        (e: unknown) => {
          rec(label, performance.now() - t);
          throw e;
        },
      );
    }
    rec(label, performance.now() - t);
    return r;
  };
}
function pct(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}
const f = (x: number) => x.toFixed(1).padStart(7);

(process.env.PROFILE_BURST === '1' ? describe : describe.skip)('프로파일링 — POST /punches 100건 동시', () => {
  let app: INestApplication;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPunchPolicyConfigFixture();
    await loadWeeklyAlertPolicyConfigFixture();
    await loadSiteIpAllowlistFixture(fixture.siteA.id, '127.0.0.1/32', 'profile');
    app = await createTestApp();
    await app.listen(0);
    const queues = [
      RECALCULATION_QUEUE_NAME,
      FRAUD_DETECTION_QUEUE_NAME,
      WEEKLY_ALERT_QUEUE_NAME,
      WEEKLY_RECALC_BATCH_QUEUE_NAME,
      HR_SYNC_QUEUE_NAME,
    ].map((n) => app.get<Queue>(getQueueToken(n)));
    await Promise.all(queues.map((q) => q.obliterate({ force: true })));

    wrap(JwtAuthGuard.prototype, 'canActivate', '1 JwtAuthGuard');
    wrap(PrincipalGuard.prototype, 'canActivate', '2 PrincipalGuard(DB 3회)');
    wrap(IpAllowlistGuard.prototype, 'canActivate', '3 IpAllowlistGuard(DB)');
    wrap(PunchesController.prototype, 'create', '4 핸들러 전체');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrap(PunchesService.prototype as any, 'getSite', '4a getSite');
    wrap(PunchPolicyResolverService.prototype, 'resolve', '4b policyResolver.resolve');
    wrap(PunchRawRepository.prototype, 'createIdempotent', '4c punch_raw INSERT');
    wrap(RecalculationTriggerService.prototype, 'onPunchSaved', '4d recalc enqueue(Redis)');
    wrap(FraudDetectionTriggerService.prototype, 'onPunchSaved', '4e fraud enqueue(Redis)');
    wrap(AccessLogService.prototype, 'write', '5 access_log INSERT(응답 후)');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrap(RecalculationTriggerService.prototype as any, 'waitForPriorJobToSettle', '4d-1 재계산 선행잡 확인(getJob)');
    wrap(Queue.prototype, 'add', '4d-2 BullMQ Queue.add (모든 큐)');
    wrap(RecalculationService.prototype, 'recalculateSingleDay', 'W 워커: 재계산 1건');
  }, 120000);

  afterAll(async () => {
    await app.close();
  }, 200000);

  it('단계별 시간', async () => {
    const password = 'LoadTest!Pass123';
    const passwordHash = await bcrypt.hash(password, 4);
    const employees = await Promise.all(
      Array.from({ length: N }).map(async (_, i) => {
        const e = await adminPrisma.employee.create({
          data: {
            employeeNo: `LOAD-${i}`,
            name: `부하테스트-${i}`,
            employmentType: 'REGULAR',
            hireDate: new Date('2024-01-01'),
            primarySiteId: fixture.siteA.id,
          },
        });
        await adminPrisma.employeeCredential.create({
          data: { employeeId: e.id, passwordHash, mustChangePassword: false },
        });
        await adminPrisma.employeeSiteAssignment.create({
          data: { employeeId: e.id, siteId: fixture.siteA.id, assignmentRole: 'PRIMARY', startDate: new Date('2024-01-01') },
        });
        return e;
      }),
    );
    const tokens = await loginInChunks(
      app,
      employees.map((e) => ({ employeeNo: e.employeeNo, password, deviceId: `dev-load-${e.employeeNo}` })),
    );
    const recalcQ0 = app.get<Queue>(getQueueToken(RECALCULATION_QUEUE_NAME));
    const fraudQ0 = app.get<Queue>(getQueueToken(FRAUD_DETECTION_QUEUE_NAME));
    const warmN = Number(process.env.PROFILE_WARM ?? 0);
    if (warmN > 0) {
      // 같은 경로를 먼저 한 번 달궈 둔다(V8 JIT, Prisma 쿼리 계획, 연결 수립). 다른 근로일/타입이라 본 측정과 겹치지 않는다.
      await Promise.all(
        employees.slice(0, warmN).map((e, i) =>
          request(app.getHttpServer())
            .post('/punches')
            .set('Authorization', `Bearer ${tokens[i].accessToken}`)
            .send({ punchType: 'OUT', recordedAt: '2026-06-14T18:00:00+09:00', siteId: fixture.siteA.id, registrationMethod: 'PC', deviceId: `dev-load-${e.employeeNo}`, clientEventId: `warm-${e.employeeNo}` }),
        ),
      );
      const waitIdle = async (q: Queue) => { const t0 = Date.now(); while ((await q.getActiveCount()) + (await q.getWaitingCount()) > 0 && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100)); };
      await Promise.all([waitIdle(recalcQ0), waitIdle(fraudQ0), waitIdle(app.get<Queue>(getQueueToken(WEEKLY_ALERT_QUEUE_NAME)))]);
      await new Promise((r) => setTimeout(r, 1500));
    }
    // ioredis 명령별 왕복 시간(BullMQ가 쓰는 ioredis 사본): sendCommand 호출 → 응답
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ioredisPath = require.resolve('ioredis', { paths: [require.resolve('bullmq')] });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RedisCls = require(ioredisPath);
    const origSend = RedisCls.prototype.sendCommand;
    RedisCls.prototype.sendCommand = function (cmd: { name: string; promise: Promise<unknown> }, stream?: unknown) {
      const t = performance.now();
      const r = origSend.call(this, cmd, stream);
      const label = 'R redis ' + cmd.name + (cmd.name === 'evalsha' || cmd.name === 'eval' ? '' : '');
      Promise.resolve(cmd.promise).then(
        () => rec(label, performance.now() - t),
        () => rec(label, performance.now() - t),
      );
      return r;
    };
    const slowCli = new RedisCls({ host: '127.0.0.1', port: 6379 });
    await slowCli.call('CONFIG', 'SET', 'slowlog-log-slower-than', '1000');
    await slowCli.call('SLOWLOG', 'RESET');
    await slowCli.call('CONFIG', 'RESETSTAT');
    stages.clear(); // 로그인·워밍업 구간 제외
    // 서버 소켓 관점의 시간 분해: 연결 수락 → 요청 수신 → 응답 완료
    const srv = app.getHttpServer();
    srv.on('connection', (sock: { __tc?: number }) => {
      sock.__tc = performance.now();
    });
    srv.prependListener('request', (req: { socket: { __tc?: number }; __t0?: number }, res: { on: (e: string, cb: () => void) => void }) => {
      const t0 = performance.now();
      req.__t0 = t0;
      if (req.socket.__tc !== undefined) rec('S1 연결수락→요청수신(헤더/바디 도착)', t0 - req.socket.__tc);
      res.on('finish', () => rec('S2 요청수신→응답완료(서버 전체)', performance.now() - t0));
    });

    const recalcQueue = app.get<Queue>(getQueueToken(RECALCULATION_QUEUE_NAME));
    const fraudQueue = app.get<Queue>(getQueueToken(FRAUD_DETECTION_QUEUE_NAME));
    if (process.env.PROFILE_PAUSE === '1') {
      await recalcQueue.pause();
      await fraudQueue.pause();
    }

    // DB 쪽 관찰: 20ms마다 앱(app_rw) 세션의 상태를 센다
    const samples: { active: number; idleTx: number; lockWait: number; total: number }[] = [];
    let sampling = true;
    const sampler = (async () => {
      while (sampling) {
        const rows = await adminPrisma.$queryRawUnsafe<{ state: string; wait_event_type: string | null }[]>(
          `SELECT state, wait_event_type FROM pg_stat_activity WHERE datname='attendance_test' AND usename='app_rw'`,
        );
        samples.push({
          total: rows.length,
          active: rows.filter((r) => r.state === 'active').length,
          idleTx: rows.filter((r) => r.state?.startsWith('idle in transaction')).length,
          lockWait: rows.filter((r) => r.wait_event_type === 'Lock').length,
        });
        await new Promise((r) => setTimeout(r, 20));
      }
    })();

    const doCpu = process.env.PROFILE_CPU === '1';
    const session = new inspector.Session();
    if (doCpu) {
      session.connect();
      await new Promise<void>((res) => session.post('Profiler.enable', () => res()));
      await new Promise<void>((res) => session.post('Profiler.start', () => res()));
    }
    const cpu0 = process.cpuUsage();
    const eld = monitorEventLoopDelay({ resolution: 5 });
    eld.enable();

    // 부하 생성기를 별도 프로세스로 돌려 서버 이벤트 루프를 테스트 클라이언트와 분리한다.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runExternal = async (): Promise<{ elapsed: number; doneAt: number }[]> => {
      const port = (app.getHttpServer().address() as { port: number }).port;
      const startAt = Date.now() + 2500;
      const cfg = JSON.stringify({
        port,
        startAt,
        items: employees.map((e, i) => ({
          token: tokens[i].accessToken,
          body: { punchType: 'IN', recordedAt: '2026-06-15T09:00:00+09:00', siteId: fixture.siteA.id, registrationMethod: 'PC', deviceId: 'dev-load-' + e.employeeNo, clientEventId: 'load-evt-' + e.employeeNo },
        })),
      });
      const script = [
        "const http=require('http');",
        "let raw='';process.stdin.on('data',d=>raw+=d).on('end',()=>{",
        "const cfg=JSON.parse(raw);const out=[];let done=0;",
        "const fire=()=>{const t0=performance.now();const t00=Date.now();",
        "cfg.items.forEach((it,i)=>{const t=performance.now();const body=JSON.stringify(it.body);",
        "const req=http.request({host:'127.0.0.1',port:cfg.port,path:'/punches',method:'POST',agent:false,headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),authorization:'Bearer '+it.token}},res=>{res.resume();res.on('end',()=>{out[i]={elapsed:performance.now()-t,doneAt:Date.now()-cfg.startAt,status:res.statusCode};if(++done===cfg.items.length){console.log(JSON.stringify(out));}});});",
        "req.on('error',e=>{out[i]={elapsed:-1,doneAt:-1,status:String(e)};if(++done===cfg.items.length){console.log(JSON.stringify(out));}});req.end(body);});};",
        "setTimeout(fire,Math.max(0,cfg.startAt-Date.now()));});",
      ].join('');
      const { spawn } = await import('child_process');
      const child = spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'pipe', 'inherit'] });
      let stdout = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stdin.end(cfg);
      await new Promise((r) => setTimeout(r, Math.max(0, startAt - Date.now() - 20)));
      burstStart = performance.now();
      await new Promise<void>((res) => child.on('close', () => res()));
      const rows = JSON.parse(stdout.trim().split(String.fromCharCode(10)).pop() as string) as { elapsed: number; doneAt: number; status: unknown }[];
      rows.forEach((r) => expect([200, 201]).toContain(r.status));
      return rows;
    };
    let burstStart = performance.now();
    const durations = process.env.PROFILE_EXT === '1' ? await runExternal() : await Promise.all(
      employees.map(async (e, i) => {
        const t = performance.now();
        const res = await request(app.getHttpServer())
          .post('/punches')
          .set('Authorization', `Bearer ${tokens[i].accessToken}`)
          .send({
            punchType: 'IN',
            recordedAt: '2026-06-15T09:00:00+09:00',
            siteId: fixture.siteA.id,
            registrationMethod: 'PC',
            deviceId: `dev-load-${e.employeeNo}`,
            clientEventId: `load-evt-${e.employeeNo}`,
          });
        const elapsed = performance.now() - t;
        expect([200, 201]).toContain(res.status);
        return { elapsed, doneAt: performance.now() - burstStart };
      }),
    );
    eld.disable();
    const cpu1 = process.cpuUsage(cpu0);
    let cpuReport = '';
    if (doCpu) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prof: any = await new Promise((res) => session.post('Profiler.stop', (_e, r) => res(r.profile)));
      session.disconnect();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodes = new Map<number, any>(prof.nodes.map((n: any) => [n.id, n]));
      const self = new Map<number, number>();
      prof.samples.forEach((id: number, i: number) => self.set(id, (self.get(id) ?? 0) + (prof.timeDeltas[i] ?? 0)));
      const byCat = new Map<string, number>();
      const byFn = new Map<string, number>();
      let total = 0;
      const pkgRe = /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?((?:@[^\\/]+[\\/])?[^\\/]+)/;
      for (const [id, us] of self) {
        const n = nodes.get(id);
        const url: string = n.callFrame.url || '';
        const fn: string = n.callFrame.functionName;
        let cat = '(native)';
        if (fn === '(idle)') cat = '(idle)';
        else if (fn === '(garbage collector)') cat = '(GC)';
        else if (fn === '(program)') cat = '(program)';
        else if (url.includes('node_modules')) {
          const m = pkgRe.exec(url);
          cat = m ? m[1].split('\\').join('/') : 'node_modules';
        } else if (url.startsWith('node:')) cat = 'node:internal';
        else if (/[\\/]src[\\/]/.test(url)) cat = 'app src';
        else if (url) cat = 'other:' + url.slice(-40);
        if (fn === 'post' && url === 'node:inspector') continue;
        byCat.set(cat, (byCat.get(cat) ?? 0) + us);
        total += us;
        if (fn === 'post' && url === 'node:inspector') continue;
        if (cat !== '(idle)') {
          const key = (fn || '(anon)') + ' ' + url.split(/[\\/]/).slice(-2).join('/') + ':' + n.callFrame.lineNumber;
          byFn.set(key, (byFn.get(key) ?? 0) + us);
        }
      }
      const top = (m: Map<string, number>, k: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
      const fmt = (rows: [string, number][]) => rows.map(([k, v]) => '  ' + (v / 1000).toFixed(0).padStart(6) + 'ms  ' + k).join('\n');
      cpuReport =
        '\nCPU 프로파일(버스트 구간 전체 ' + (total / 1000).toFixed(0) + 'ms) 카테고리별 self 시간:\n' +
        fmt(top(byCat, 14)) +
        '\n상위 함수:\n' +
        fmt(top(byFn, 14));
    }
    const burstMs = performance.now() - burstStart;
    sampling = false;
    await sampler;

    let slowReport = '';
    {
      const slow = (await slowCli.call('SLOWLOG', 'GET', '40')) as [number, number, number, string[]][];
      const stats = (await slowCli.call('INFO', 'commandstats')) as string;
      slowReport =
        'Redis SLOWLOG(1ms 초과 명령 ' + slow.length + '건): ' +
        slow.slice(0, 12).map((e) => e[3][0] + ' ' + (e[2] / 1000).toFixed(1) + 'ms').join(', ') +
        String.fromCharCode(10) + 'Redis commandstats: ' +
        stats.split(String.fromCharCode(10)).filter((l) => /cmdstat_(hgetall|evalsha|eval|bzpopmin|xadd|ping)/.test(l)).map((l) => l.trim().replace('cmdstat_', '')).join(' | ');
      await slowCli.call('CONFIG', 'SET', 'slowlog-log-slower-than', '10000');
      slowCli.disconnect();
    }
    const sorted = durations.map((d) => d.elapsed).sort((a, b) => a - b);
    const lines: string[] = [];
    lines.push(
      `\n=== 변형: pause=${process.env.PROFILE_PAUSE === '1'} warm=${process.env.PROFILE_WARM ?? 0} ext=${process.env.PROFILE_EXT === '1'} cpu=${process.env.PROFILE_CPU === '1'} pool=${/connection_limit=(\d+)/.exec(process.env.DATABASE_URL ?? '')?.[1]} ===`,
    );
    lines.push(
      `전체(클라이언트) n=${sorted.length} min=${f(sorted[0])} p50=${f(pct(sorted, 50))} p95=${f(pct(sorted, 95))} max=${f(sorted[sorted.length - 1])} | 버스트 총 ${burstMs.toFixed(0)}ms`,
    );
    lines.push(
      `환경: cpus=${os.cpus().length}(${os.cpus()[0]?.model}) loadavg=${os.loadavg().map((x) => x.toFixed(2)).join('/')} | 이 프로세스 CPU 사용: user=${(cpu1.user / 1000).toFixed(0)}ms system=${(cpu1.system / 1000).toFixed(0)}ms (버스트 ${burstMs.toFixed(0)}ms 동안)`,
    );
    lines.push(
      `이벤트루프 지연(ms): mean=${(eld.mean / 1e6).toFixed(1)} p99=${(eld.percentile(99) / 1e6).toFixed(1)} max=${(eld.max / 1e6).toFixed(1)}`,
    );
    const doneTimes = durations.map((d) => d.doneAt).sort((a, b) => a - b);
    lines.push(`완료 시각 분포(버스트 시작 기준 ms): p10=${f(pct(doneTimes, 10))} p50=${f(pct(doneTimes, 50))} p90=${f(pct(doneTimes, 90))} 마지막=${f(doneTimes[doneTimes.length - 1])}`);
    lines.push('단계                              건수     p50     p95     max   (ms, 서버 내부)');
    [...stages.keys()].sort().forEach((k) => {
      const s = [...(stages.get(k) ?? [])].sort((a, b) => a - b);
      lines.push(`${k.padEnd(34)}${String(s.length).padStart(4)} ${f(pct(s, 50))} ${f(pct(s, 95))} ${f(s[s.length - 1])}`);
    });
    const max = (k: keyof (typeof samples)[0]) => Math.max(...samples.map((s) => s[k]));
    const avg = (k: keyof (typeof samples)[0]) => (samples.reduce((a, s) => a + s[k], 0) / samples.length).toFixed(1);
    lines.push(
      `DB 세션(app_rw, ${samples.length}회 샘플): 총접속 max=${max('total')} | 동시 active 평균=${avg('active')} max=${max('active')} | idle-in-tx max=${max('idleTx')} | Lock 대기 max=${max('lockWait')}`,
    );
    // eslint-disable-next-line no-console
    process.stderr.write([...lines, slowReport, cpuReport].join(String.fromCharCode(10)) + String.fromCharCode(10));

    // 정리: 남은 잡을 비운다
    await recalcQueue.resume();
    await fraudQueue.resume();
    const drain = async (q: Queue) => {
      const start = Date.now();
      while ((await q.getActiveCount()) > 0 && Date.now() - start < 15000) await new Promise((r) => setTimeout(r, 200));
    };
    const wa = app.get<Queue>(getQueueToken(WEEKLY_ALERT_QUEUE_NAME));
    const nq = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE_NAME));
    await Promise.all([drain(recalcQueue), drain(fraudQueue), drain(wa), drain(nq)]);
    await Promise.all([recalcQueue, fraudQueue, wa, nq].map((q) => q.obliterate({ force: true })));
  }, 120000);
});
