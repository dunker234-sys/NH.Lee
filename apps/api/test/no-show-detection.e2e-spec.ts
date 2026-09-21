import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { NoShowDetectionTriggerService } from '../src/modules/no-show-detection/no-show-detection-trigger.service';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { Fixture, loadFixture } from './fixtures';
import { adminPrisma } from './setup/db';

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10000, intervalMs = 200): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`waitFor 타임아웃(${timeoutMs}ms) 초과`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function d(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

describe('미등록(no-show) 감지 배치', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let trigger: NoShowDetectionTriggerService;
  let leaveTypeId: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    trigger = app.get(NoShowDetectionTriggerService);

    const leaveType = await adminPrisma.leaveType.create({
      data: { code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, deductionUnit: 'FULL_DAY' },
    });
    leaveTypeId = leaveType.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  async function createConfirmedSchedule(employeeId: string, siteId: string, workDate: string) {
    return adminPrisma.schedule.create({
      data: {
        employeeId,
        siteId,
        workDate: d(workDate),
        plannedStartAt: new Date(`${workDate}T09:00:00+09:00`),
        plannedEndAt: new Date(`${workDate}T18:00:00+09:00`),
        plannedBreakMinutes: 60,
        status: 'CONFIRMED',
      },
    });
  }

  it('계획근태는 있으나 실적(IN 타각)이 없으면 익일 감지 대상이 생성된다', async () => {
    const employeeId = fixture.employees.plainEmployeeA.id;
    const workDate = '2026-07-06';
    const schedule = await createConfirmedSchedule(employeeId, fixture.siteA.id, workDate);

    await trigger.triggerForDate(workDate);

    await waitFor(async () => {
      const target = await prisma.noShowNotificationTarget.findUnique({
        where: { employeeId_workDate: { employeeId, workDate: d(workDate) } },
      });
      return target !== null;
    });

    const target = await prisma.noShowNotificationTarget.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: d(workDate) } },
    });
    expect(target.scheduleId).toBe(schedule.id);
    expect(target.siteId).toBe(fixture.siteA.id);
    expect(target.notifiedAt).toBeNull(); // 실제 발송은 STEP4.5 몫 — 항상 NULL로 생성된다
  });

  it('승인된 종일 휴가가 있으면 감지 대상에서 제외된다', async () => {
    const employeeId = fixture.employees.regional.id;
    const workDate = '2026-07-07';
    await createConfirmedSchedule(employeeId, fixture.siteA.id, workDate);
    await adminPrisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId,
        startDate: d(workDate),
        endDate: d(workDate),
        unit: 'FULL',
        status: 'APPROVED',
      },
    });

    await trigger.triggerForDate(workDate);

    // 다른 사업장에서의 정상 감지(대조군)와 동시에 실행해, 큐가 실제로 이 날짜를
    // 처리했다는 걸 그 대조군의 완료로 간접 확인한 뒤 이쪽은 끝내 생기지 않았음을 본다.
    const controlEmployeeId = fixture.employees.hqHr.id;
    await createConfirmedSchedule(controlEmployeeId, fixture.siteA.id, workDate);
    await trigger.triggerForDate(workDate);

    await waitFor(async () => {
      const control = await prisma.noShowNotificationTarget.findUnique({
        where: { employeeId_workDate: { employeeId: controlEmployeeId, workDate: d(workDate) } },
      });
      return control !== null;
    });

    const target = await prisma.noShowNotificationTarget.findUnique({
      where: { employeeId_workDate: { employeeId, workDate: d(workDate) } },
    });
    expect(target).toBeNull();
  });

  it('다른 사업장(외근/지원)에서라도 실제로 IN을 찍었으면 감지 대상에서 제외된다', async () => {
    const employeeId = fixture.employees.siteManagerA.id;
    const workDate = '2026-07-08';
    await createConfirmedSchedule(employeeId, fixture.siteA.id, workDate);

    await adminPrisma.punchRaw.create({
      data: {
        employeeId,
        siteId: fixture.siteB.id, // 스케줄은 siteA인데 실제로는 siteB에서 IN
        punchType: 'IN',
        recordedAt: new Date(`${workDate}T09:00:00+09:00`),
        workDate: d(workDate),
        idempotencyKey: `no-show-test-${employeeId}-${workDate}`,
        registrationMethod: 'PC',
        deviceId: 'dispatch-device',
        integrityFlags: [],
      },
    });

    await trigger.triggerForDate(workDate);

    const controlEmployeeId = fixture.employees.hqHr.id;
    await createConfirmedSchedule(controlEmployeeId, fixture.siteB.id, workDate);
    await trigger.triggerForDate(workDate);

    await waitFor(async () => {
      const control = await prisma.noShowNotificationTarget.findUnique({
        where: { employeeId_workDate: { employeeId: controlEmployeeId, workDate: d(workDate) } },
      });
      return control !== null;
    });

    const target = await prisma.noShowNotificationTarget.findUnique({
      where: { employeeId_workDate: { employeeId, workDate: d(workDate) } },
    });
    expect(target).toBeNull();
  });
});
