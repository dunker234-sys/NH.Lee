import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { SystemContextService } from '../src/common/principal/system-context.service';
import { RecalculationOpsService } from '../src/modules/recalculation/recalculation-ops.service';
import { RecalculationTriggerService } from '../src/modules/recalculation/recalculation-trigger.service';
import { RecalculationService } from '../src/modules/recalculation/recalculation.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from '../src/modules/recalculation/queue.constants';
import { addDays, mondayOfWeek } from '../src/common/time/week.util';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { Fixture, loadFixture, loadPolicyConfigFixture } from './fixtures';

/** KST 로컬 시각을 timestamptz로 만든다(seed.ts와 동일한 관례). */
function kst(dateStr: string, hhmm: string): Date {
  return new Date(`${dateStr}T${hhmm}:00+09:00`);
}

function workDateOf(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`waitFor 타임아웃(${timeoutMs}ms) 초과`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** STEP 3.5 완료조건 4개를 실제 Postgres(app_rw)+실제 Redis(Memurai)로 검증한다. */
describe('RecalculationService — 근태 집계 오케스트레이션', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let recalculationService: RecalculationService;
  let trigger: RecalculationTriggerService;
  let ops: RecalculationOpsService;
  let systemContext: SystemContextService;
  let queue: Queue<RecalculationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    recalculationService = app.get(RecalculationService);
    trigger = app.get(RecalculationTriggerService);
    ops = app.get(RecalculationOpsService);
    systemContext = app.get(SystemContextService);
    queue = app.get<Queue<RecalculationJobData>>(getQueueToken(RECALCULATION_QUEUE_NAME));
  }, 60000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await app.close();
  });

  async function insertPunch(employeeId: string, workDate: string, type: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN', hhmm: string) {
    return prisma.punchRaw.create({
      data: {
        employeeId,
        siteId: fixture.siteA.id,
        punchType: type,
        recordedAt: kst(workDate, hhmm),
        workDate: workDateOf(workDate),
        idempotencyKey: `${employeeId}-${type}-${workDate}-${hhmm}-${Math.random().toString(36).slice(2)}`,
        registrationMethod: 'PC',
        deviceId: 'e2e-test-device',
        integrityFlags: [],
      },
    });
  }

  async function recalcDirect(employeeId: string, workDate: string) {
    return systemContext.runAsSystem('attendance_daily', (principal) =>
      recalculationService.recalculateSingleDay(employeeId, workDate, principal),
    );
  }

  // ---------------------------------------------------------------------
  // 완료조건 1: 타각 저장 → 5초 내 attendance_daily 생성 (실제 큐 경로)
  // ---------------------------------------------------------------------
  it('타각 저장 후 onPunchSaved()를 호출하면 5초 안에 attendance_daily가 생성된다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const workDate = '2026-03-11';
    await insertPunch(employeeId, workDate, 'IN', '09:00');
    await insertPunch(employeeId, workDate, 'OUT', '18:00');

    await trigger.onPunchSaved(employeeId, workDate);

    await waitFor(async () => {
      const row = await prisma.attendanceDaily.findUnique({
        where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } },
      });
      return row !== null;
    }, 5000);

    const row = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(workDate) } },
    });
    expect(row.actualWorkMinutes).toBeGreaterThan(0);
    expect(row.status).not.toBe('PENDING');
  }, 10000);

  // ---------------------------------------------------------------------
  // 완료조건 2: 정정 승인 → 일·주·월·52h 자동 갱신
  // ---------------------------------------------------------------------
  it('정정 승인이 daily/weekly/monthly와 52h 판정을 자동으로 갱신한다', async () => {
    const employeeId = fixture.employees.siteManagerA.id;
    const weekStartDate = mondayOfWeek('2026-06-10');
    const saturday = addDays(weekStartDate, 5);

    // 월~금: 12시간 체류(자기일관적 휴게 60분, 실근로 660분/일) 픽스처.
    const fillerDates = [0, 1, 2, 3, 4].map((i) => addDays(weekStartDate, i));
    for (const d of fillerDates) {
      await insertPunch(employeeId, d, 'IN', '08:00');
      await insertPunch(employeeId, d, 'OUT', '20:00');
      await recalcDirect(employeeId, d);
    }

    // 토요일: 원래 짧게(2시간) 찍힌 실적 — "정정 전" 상태를 실제로 만들어 둔다.
    await insertPunch(employeeId, saturday, 'IN', '08:00');
    await insertPunch(employeeId, saturday, 'OUT', '10:00');
    await recalcDirect(employeeId, saturday);

    const before = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(saturday) } },
    });
    expect(before.actualWorkMinutes).toBeLessThan(200);

    // 실제로는 08:00-10:00만 찍혔지만 20:00까지 근무했던 정정 신청(사유: 타각 누락)이 승인된 상태.
    const outPunchRows = await prisma.punchRaw.findMany({
      where: { employeeId, workDate: workDateOf(saturday), punchType: 'OUT' },
    });
    expect(outPunchRows).toHaveLength(1);

    await prisma.correctionRequest.create({
      data: {
        employeeId,
        targetPunchId: outPunchRows[0].id,
        targetWorkDate: workDateOf(saturday),
        reasonCode: 'PUNCH_MISSING',
        reasonDetail: '실제 퇴근은 20:00인데 기기 오류로 10:00에 잘못 찍혔습니다.',
        afterValue: { punchType: 'OUT', recordedAt: kst(saturday, '20:00').toISOString() },
        status: 'APPROVED_L1',
      },
    });

    await trigger.onCorrectionApproved(employeeId, saturday);

    await waitFor(async () => {
      const row = await prisma.attendanceDaily.findUniqueOrThrow({
        where: { employeeId_workDate: { employeeId, workDate: workDateOf(saturday) } },
      });
      return row.actualWorkMinutes > 600;
    });

    const after = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(saturday) } },
    });
    expect(after.actualWorkMinutes).toBeGreaterThan(600); // 12h 기준(660분)으로 갱신됨

    const weekly = await prisma.attendanceWeekly.findUniqueOrThrow({
      where: { employeeId_weekStartDate: { employeeId, weekStartDate: workDateOf(weekStartDate) } },
    });
    // 5일(660) + 토요일(660) = 3960분 > 40h(2400) + 12h(720) 한도 → 위반.
    expect(weekly.totalWorkMinutes).toBeGreaterThanOrEqual(3900);
    expect(weekly.limitViolationFlag).toBe(true);
    expect(weekly.flexibleWorkSkipped).toBe(false);

    const yearMonth = saturday.slice(0, 7);
    const monthly = await prisma.attendanceMonthly.findUniqueOrThrow({
      where: { employeeId_yearMonth: { employeeId, yearMonth } },
    });
    const totals = monthly.totals as unknown as { actualWorkMinutes: number };
    expect(totals.actualWorkMinutes).toBeGreaterThanOrEqual(3900);
  }, 20000);

  // ---------------------------------------------------------------------
  // 완료조건 3: 멱등성 — 동일 입력 3회 연속 재계산 시 calculatedAt 제외 전부 동일
  // ---------------------------------------------------------------------
  it('같은 (직원, 근로일)을 3번 연속 재계산해도 calculatedAt을 제외한 모든 필드가 같다', async () => {
    const employeeId = fixture.employees.regional.id;
    const workDate = '2026-04-08';
    await insertPunch(employeeId, workDate, 'IN', '09:00');
    await insertPunch(employeeId, workDate, 'OUT', '18:00');

    const r1 = await recalcDirect(employeeId, workDate);
    const r2 = await recalcDirect(employeeId, workDate);
    const r3 = await recalcDirect(employeeId, workDate);

    const strip = (r: typeof r1) => {
      const { calculatedAt: _calculatedAt, ...rest } = r;
      return rest;
    };

    expect(strip(r2)).toEqual(strip(r1));
    expect(strip(r3)).toEqual(strip(r1));
    expect(r1.inputSnapshotHash).toBe(r2.inputSnapshotHash);
    expect(r1.inputSnapshotHash).toBe(r3.inputSnapshotHash);
  }, 15000);

  // ---------------------------------------------------------------------
  // 완료조건 4: 부분 실패 — 실패한 날짜만 재처리, 나머지는 건드리지 않음
  // ---------------------------------------------------------------------
  it('배치 중 한 날짜가 실패해도 나머지는 성공하고, 재시도는 실패한 날짜만 재처리한다', async () => {
    const employeeId = fixture.employees.hqHr.id;
    const day1 = '2026-05-05';
    const day2 = '2026-05-06'; // 순환모순 유발 대상
    const day3 = '2026-05-07';

    // day1/day3: 9시간 체류 — 자기일관적 휴게(60분)로 정상 계산됨.
    await insertPunch(employeeId, day1, 'IN', '08:00');
    await insertPunch(employeeId, day1, 'OUT', '17:00');
    await insertPunch(employeeId, day3, 'IN', '08:00');
    await insertPunch(employeeId, day3, 'OUT', '17:00');

    // day2: 13시간 체류, 휴게 타각/스케줄 전혀 없음 → resolveConsistentBreak가
    // 어떤 후보(0/30/60/90/120분)로도 자기일관성을 만족하지 못해 실제로
    // CircularBreakContradictionError가 발생한다(가짜 실패 훅이 아니다).
    await insertPunch(employeeId, day2, 'IN', '08:00');
    await insertPunch(employeeId, day2, 'OUT', '21:00');

    await trigger.onPunchSaved(employeeId, day1);
    await trigger.onPunchSaved(employeeId, day2);
    await trigger.onPunchSaved(employeeId, day3);

    await waitFor(async () => {
      const [r1, r3] = await Promise.all([
        prisma.attendanceDaily.findUnique({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(day1) } } }),
        prisma.attendanceDaily.findUnique({ where: { employeeId_workDate: { employeeId, workDate: workDateOf(day3) } } }),
      ]);
      return r1 !== null && r3 !== null;
    });

    await waitFor(async () => {
      const failed = await queue.getFailed();
      return failed.some((j) => j.data.employeeId === employeeId && j.data.workDate === day2);
    }, 10000);

    const day2RowBeforeRetry = await prisma.attendanceDaily.findUnique({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(day2) } },
    });
    expect(day2RowBeforeRetry).toBeNull();

    const day1Row = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(day1) } },
    });
    const day3Row = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(day3) } },
    });
    const day1CalculatedAtBefore = day1Row.calculatedAt.getTime();
    const day3CalculatedAtBefore = day3Row.calculatedAt.getTime();

    // 입력을 고친다: 실제 휴게 타각을 추가해 순환모순을 해소한다.
    await insertPunch(employeeId, day2, 'BREAK_OUT', '12:00');
    await insertPunch(employeeId, day2, 'BREAK_IN', '12:30');

    await ops.retryFailedJobs();

    await waitFor(async () => {
      const row = await prisma.attendanceDaily.findUnique({
        where: { employeeId_workDate: { employeeId, workDate: workDateOf(day2) } },
      });
      return row !== null;
    }, 10000);

    const day2Row = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(day2) } },
    });
    expect(day2Row.actualWorkMinutes).toBeGreaterThan(0);

    const day1RowAfter = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(day1) } },
    });
    const day3RowAfter = await prisma.attendanceDaily.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: workDateOf(day3) } },
    });
    // day1/day3는 재처리되지 않았다는 증거: calculatedAt이 그대로다.
    expect(day1RowAfter.calculatedAt.getTime()).toBe(day1CalculatedAtBefore);
    expect(day3RowAfter.calculatedAt.getTime()).toBe(day3CalculatedAtBefore);
  }, 25000);
});
