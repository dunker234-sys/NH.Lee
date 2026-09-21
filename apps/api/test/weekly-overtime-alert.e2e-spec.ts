import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RecalculationTriggerService } from '../src/modules/recalculation/recalculation-trigger.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData } from '../src/modules/recalculation/queue.constants';
import { WeeklyOvertimeAlertService } from '../src/modules/weekly-alert/weekly-overtime-alert.service';
import { mondayOfWeek } from '../src/common/time/week.util';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import {
  Fixture,
  loadFixture,
  loadNotificationPolicyConfigFixture,
  loadPolicyConfigFixture,
  loadWeeklyAlertPolicyConfigFixture,
} from './fixtures';

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

/** STEP9 완료조건(52시간 알림)을 실제 Postgres+Redis로 검증한다. */
describe('WeeklyOvertimeAlertService — 요구사항서 4.4② 52시간 알림', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let trigger: RecalculationTriggerService;
  let alertService: WeeklyOvertimeAlertService;
  let recalcQueue: Queue<RecalculationJobData>;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadWeeklyAlertPolicyConfigFixture();
    await loadNotificationPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    trigger = app.get(RecalculationTriggerService);
    alertService = app.get(WeeklyOvertimeAlertService);
    recalcQueue = app.get<Queue<RecalculationJobData>>(getQueueToken(RECALCULATION_QUEUE_NAME));
  }, 60000);

  afterAll(async () => {
    await recalcQueue.obliterate({ force: true });
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

  async function alertLogsFor(employeeId: string) {
    return prisma.alertLog.findMany({ where: { recipientEmployeeId: employeeId, notificationType: 'WEEKLY_OVERTIME_ALERT' } });
  }

  // -----------------------------------------------------------------------
  // 완료조건: 타각 → 실시간 재계산 → 52h 알림 전체 파이프라인이 실제로 이어진다
  // -----------------------------------------------------------------------
  it('평일 5일 07:00~20:00(13h span) 타각 → 실시간 재계산 후 EXCEEDED 알림이 본인+사업장관리자+권역+HQ_HR까지 간다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const weekStart = '2026-03-16'; // 월요일
    const days = ['2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19', '2026-03-20'];

    // 휴게 타각을 명시해 자동 휴게 파생(모순 시 CircularBreakContradictionError)을
    // 피한다 — 13h 스팬에 60분 휴게를 명시하면 실근로 12h(720분)/일이 정확히 나온다.
    // 하루가 끝날 때마다 그 시점까지의 누적 주간 합계(recalculateWeek까지 끝난
    // 상태)를 확인한 뒤에만 다음 날로 넘어간다 — daily 행 존재만 확인하면
    // recalculateWeek/알림 평가가 아직 끝나기 전에 다음 날을 트리거해, 그
    // 사이 짧게 겹치는 recalculateWeek 호출들이 서로 다른 스냅샷을 읽어
    // 경합할 수 있다(실제 운영에서는 하루하루가 실제 하루 간격으로 벌어져
    // 이런 경합이 없다).
    for (let i = 0; i < days.length; i += 1) {
      const day = days[i];
      const expectedCumulativeMinutes = 720 * (i + 1);
      await insertPunch(employeeId, day, 'IN', '07:00');
      await insertPunch(employeeId, day, 'BREAK_OUT', '12:00');
      await insertPunch(employeeId, day, 'BREAK_IN', '13:00');
      await insertPunch(employeeId, day, 'OUT', '20:00');
      await trigger.onPunchSaved(employeeId, day);
      await waitFor(async () => {
        const weekly = await prisma.attendanceWeekly.findUnique({
          where: { employeeId_weekStartDate: { employeeId, weekStartDate: workDateOf(weekStart) } },
        });
        return weekly !== null && weekly.totalWorkMinutes === expectedCumulativeMinutes;
      }, 8000);
    }

    await waitFor(async () => {
      const weekly = await prisma.attendanceWeekly.findUnique({
        where: { employeeId_weekStartDate: { employeeId, weekStartDate: workDateOf(weekStart) } },
      });
      return weekly !== null && weekly.limitViolationFlag === true;
    }, 5000);

    // WEEKLY_ALERT_QUEUE_NAME은 RECALCULATION_QUEUE_NAME과 물리적으로 분리된
    // 별도 큐라(weekly-alert.module.ts 참고 — 커넥션 풀 경합 방지 목적),
    // 평가가 실제로 끝나기까지 한 홉(enqueue → 별도 워커의 처리)이 더 걸린다.
    await waitFor(async () => (await alertLogsFor(employeeId)).some((l) => l.stage === 'EXCEEDED'), 15000);

    const employeeLogs = await alertLogsFor(employeeId);
    expect(employeeLogs.some((l) => l.stage === 'EXCEEDED')).toBe(true);
    expect(employeeLogs[0].targetPeriod).toBe(`${weekStart}#${employeeId}`);

    // evaluateAndNotify()는 본인 notify() 다음에 에스컬레이션 수신자별
    // notify()를 순차로 await하므로, 같은 함수 안에서 본인 로그가 보이는
    // 시점과 마지막 수신자(HQ_HR) 로그가 보이는 시점 사이에 실제 시간차가
    // 있다 — 각 수신자 로그가 나타날 때까지 개별적으로 기다린다.
    await waitFor(async () => (await alertLogsFor(fixture.employees.siteManagerA.id)).some((l) => l.stage === 'EXCEEDED'), 10000);
    await waitFor(async () => (await alertLogsFor(fixture.employees.regional.id)).some((l) => l.stage === 'EXCEEDED'), 10000);
    await waitFor(async () => (await alertLogsFor(fixture.employees.hqHr.id)).some((l) => l.stage === 'EXCEEDED'), 10000);

    const siteManagerLogs = await alertLogsFor(fixture.employees.siteManagerA.id);
    const regionalLogs = await alertLogsFor(fixture.employees.regional.id);
    const hqHrLogs = await alertLogsFor(fixture.employees.hqHr.id);
    expect(siteManagerLogs.some((l) => l.stage === 'EXCEEDED')).toBe(true);
    expect(regionalLogs.some((l) => l.stage === 'EXCEEDED')).toBe(true);
    expect(hqHrLogs.some((l) => l.stage === 'EXCEEDED')).toBe(true);
  }, 90000);

  // -----------------------------------------------------------------------
  // 완료조건: 소정 20h 근로자가 주 32h에서 알림을 받는다(절대값 45h만 썼다면 침묵했을 사례)
  // -----------------------------------------------------------------------
  it('소정 20h(1200분) 근로자가 32h(1920분)에서 위험 단계 알림을 받는다', async () => {
    const partTime = await prisma.employee.create({
      data: {
        employeeNo: 'T-PARTTIME-32H',
        name: '단시간직원',
        employmentType: 'PART_TIME',
        hireDate: new Date('2025-01-01'),
        primarySiteId: fixture.siteA.id,
        contractedWorkMinutes: 1200,
        role: 'EMPLOYEE',
      },
    });
    const weekStart = '2026-03-23';
    await prisma.attendanceWeekly.create({
      data: {
        employeeId: partTime.id,
        weekStartDate: workDateOf(weekStart),
        totalWorkMinutes: 1920,
        over40Minutes: 0,
        limitViolationFlag: false,
        weeklyBasisOvertimeMinutes: 0,
        totalOvertimeForPremiumMinutes: 0,
        flexibleWorkSkipped: false,
      },
    });

    const result = await alertService.evaluateAndNotify(partTime.id, weekStart);
    expect(result?.stage).toBe('DANGER');

    const logs = await alertLogsFor(partTime.id);
    expect(logs.some((l) => l.stage === 'DANGER')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 완료조건: 동일 주차 동일 단계 알림은 1회만 발송된다
  // -----------------------------------------------------------------------
  it('같은 주·같은 단계로 두 번 평가해도 alert_log는 채널당 1건만 남는다', async () => {
    const dedupEmployee = await prisma.employee.create({
      data: {
        employeeNo: 'T-DEDUP-WEEKLY',
        name: '중복방지직원',
        employmentType: 'REGULAR',
        hireDate: new Date('2025-01-01'),
        primarySiteId: fixture.siteA.id,
        role: 'EMPLOYEE',
      },
    });
    const weekStart = '2026-03-30';
    await prisma.attendanceWeekly.create({
      data: {
        employeeId: dedupEmployee.id,
        weekStartDate: workDateOf(weekStart),
        totalWorkMinutes: 2880, // 48h — WARNING
        over40Minutes: 480,
        limitViolationFlag: false,
        weeklyBasisOvertimeMinutes: 0,
        totalOvertimeForPremiumMinutes: 480,
        flexibleWorkSkipped: false,
      },
    });

    await alertService.evaluateAndNotify(dedupEmployee.id, weekStart);
    await alertService.evaluateAndNotify(dedupEmployee.id, weekStart); // 재계산 재실행 흉내 — 같은 단계 재평가

    const logs = await prisma.alertLog.findMany({
      where: { recipientEmployeeId: dedupEmployee.id, notificationType: 'WEEKLY_OVERTIME_ALERT', stage: 'WARNING' },
    });
    expect(logs).toHaveLength(1); // PUSH 채널 1개 — 두 번째 evaluateAndNotify는 dedup으로 조용히 무시된다
  });
});
