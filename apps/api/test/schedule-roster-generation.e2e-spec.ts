import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { deriveWorkDateString } from '../src/common/time/work-date.util';
import { createTestApp } from './setup/app';
import { adminPrisma, resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadSchedulePolicyConfigFixture } from './fixtures';

function timeOfDay(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}

/**
 * 완료조건: 야간 걸침 시프트 배정 시 work_date가 시업일로 생성된다.
 * deriveWorkDateString(plannedStartAt)을 오라클로 직접 호출해 서버 응답과
 * 대조한다 — plannedEndAt 기준 ::date 캐스팅 회귀(절대 규칙5 위반) 클래스의
 * 버그를 실제로 잡아낼 수 있는 형태다.
 */
describe('POST /admin/schedule/rosters/generate — 야간 걸침 시프트의 work_date', () => {
  let app: INestApplication;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadSchedulePolicyConfigFixture();
    app = await createTestApp();
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('22:00~06:00 야간조는 plannedStartAt 기준 시업일로 work_date가 생성된다', async () => {
    const nightTemplate = await adminPrisma.shiftTemplate.create({
      data: {
        siteId: fixture.siteA.id,
        name: '야간조',
        startTime: timeOfDay('22:00'),
        endTime: timeOfDay('06:00'),
        crossesMidnight: true,
        applicableWeekdays: [1, 2, 3, 4, 5, 6, 7],
      },
    });

    const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-roster-night');
    const res = await request(app.getHttpServer())
      .post('/admin/schedule/rosters/generate')
      .set({ Authorization: `Bearer ${accessToken}` })
      .send({
        siteId: fixture.siteA.id,
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        assignments: [
          {
            employeeId: fixture.employees.plainEmployeeA.id,
            cycleLengthDays: 1,
            pattern: [nightTemplate.id],
            anchorDate: '2026-09-01',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    const row = res.body.rows[0];

    const plannedStartAt: string = row.plannedStartAt;
    const plannedEndAt: string = row.plannedEndAt;
    const workDate: string = new Date(row.workDate).toISOString().slice(0, 10);

    expect(workDate).toBe('2026-09-01'); // 시업일
    expect(workDate).toBe(deriveWorkDateString(new Date(plannedStartAt))); // 오라클과 일치
    // 종료 시각(06:00 KST)의 KST 달력일은 다음 날이다 — deriveWorkDateString은
    // "그 인스턴트의 KST 달력일"을 구하는 함수라 이걸로 검증한다(UTC 슬라이스로
    // 직접 비교하면 KST가 UTC+9라 06:00 KST는 전날 21:00 UTC라 혼동을 부른다).
    expect(deriveWorkDateString(new Date(plannedEndAt))).toBe('2026-09-02');
    expect(workDate).not.toBe(deriveWorkDateString(new Date(plannedEndAt))); // 종료일 기준이 아님을 명시적으로 반증
  });
});
