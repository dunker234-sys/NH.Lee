import {
  countPending,
  enqueuePunch,
  ensureSchema,
  listPending,
  markFailedRetryable,
  markSent,
  markStatus,
  toCreatePunchInput,
} from '../punchQueueLogic';
import { createNodeSqliteExecutor } from './nodeSqliteAdapter';

function baseInput(overrides: Partial<Parameters<typeof enqueuePunch>[1]> = {}) {
  return {
    localId: 'local-1',
    employeeId: 'emp-1',
    punchType: 'IN' as const,
    recordedAt: '2026-08-27T00:00:00.000Z',
    siteId: 'site-1',
    registrationMethod: 'GPS' as const,
    deviceId: 'device-1',
    clientEventId: 'client-event-1',
    createdAt: '2026-08-27T00:00:00.100Z',
    ...overrides,
  };
}

describe('punchQueueLogic — 오프라인 큐 순수 로직', () => {
  it('enqueue한 행은 PENDING 상태로 listPending에 나타난다', async () => {
    const db = createNodeSqliteExecutor();
    await ensureSchema(db);
    await enqueuePunch(db, baseInput());

    const pending = await listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('PENDING');
    expect(pending[0].local_id).toBe('local-1');
  });

  it('재전송(재시도) 시에도 recordedAt/clientEventId/deviceId가 최초 값과 완전히 동일하다 — 완료조건1의 핵심', async () => {
    const db = createNodeSqliteExecutor();
    await ensureSchema(db);
    await enqueuePunch(db, baseInput());

    // 1차 시도: 서버 DTO로 변환(전송 전)
    const firstAttemptDto = toCreatePunchInput((await listPending(db))[0]);

    // 강제종료→재실행을 흉내: 전송 실패로 FAILED_RETRYABLE 처리 후 다시 listPending으로 조회
    await markFailedRetryable(db, 'local-1', '2026-08-27T00:00:05.000Z');
    const secondAttemptDto = toCreatePunchInput((await listPending(db))[0]);

    // 재계산(new Date() 등)이 개입했다면 recordedAt이 달라졌을 것이다 — 완전히 동일해야 한다.
    expect(secondAttemptDto).toEqual(firstAttemptDto);
    expect(secondAttemptDto.recordedAt).toBe('2026-08-27T00:00:00.000Z');
    expect(secondAttemptDto.clientEventId).toBe('client-event-1');
    expect(secondAttemptDto.deviceId).toBe('device-1');
  });

  it('FAILED_RETRYABLE 행은 attempt_count가 증가하고 다음 flush에서 다시 listPending에 잡힌다', async () => {
    const db = createNodeSqliteExecutor();
    await ensureSchema(db);
    await enqueuePunch(db, baseInput());

    await markFailedRetryable(db, 'local-1', '2026-08-27T00:00:05.000Z');
    const pending = await listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('FAILED_RETRYABLE');
    expect(pending[0].attempt_count).toBe(1);
    expect(pending[0].last_attempt_at).toBe('2026-08-27T00:00:05.000Z');
  });

  it('markSent 이후에는 listPending에서 사라지고 countPending이 0이 된다 — 중복 재전송 방지', async () => {
    const db = createNodeSqliteExecutor();
    await ensureSchema(db);
    await enqueuePunch(db, baseInput());

    await markSent(db, 'local-1', 'server-punch-1', 'NORMAL');

    expect(await listPending(db)).toHaveLength(0);
    expect(await countPending(db)).toBe(0);
  });

  it('여러 행은 recorded_at 오름차순(최초 발생 순서)으로 반환된다', async () => {
    const db = createNodeSqliteExecutor();
    await ensureSchema(db);
    await enqueuePunch(db, baseInput({ localId: 'local-2', recordedAt: '2026-08-27T02:00:00.000Z', clientEventId: 'ce-2' }));
    await enqueuePunch(db, baseInput({ localId: 'local-1', recordedAt: '2026-08-27T01:00:00.000Z', clientEventId: 'ce-1' }));

    const pending = await listPending(db);
    expect(pending.map((r) => r.local_id)).toEqual(['local-1', 'local-2']);
  });

  it('SENDING으로 표시된 행도 listPending에서는 제외된다(PENDING/FAILED_RETRYABLE만 대상)', async () => {
    const db = createNodeSqliteExecutor();
    await ensureSchema(db);
    await enqueuePunch(db, baseInput());
    await markStatus(db, ['local-1'], 'SENDING');

    expect(await listPending(db)).toHaveLength(0);
  });

  it('위치정보를 생략하면 location 필드가 undefined로 왕복하고, 제공하면 값이 그대로 보존된다', async () => {
    const db = createNodeSqliteExecutor();
    await ensureSchema(db);
    await enqueuePunch(db, baseInput({ localId: 'no-loc', clientEventId: 'ce-no-loc' }));
    await enqueuePunch(
      db,
      baseInput({
        localId: 'with-loc',
        clientEventId: 'ce-with-loc',
        location: { lat: 37.5665, lng: 126.978, accuracyM: 12.5 },
      }),
    );

    const rows = await listPending(db);
    const noLocDto = toCreatePunchInput(rows.find((r) => r.local_id === 'no-loc')!);
    const withLocDto = toCreatePunchInput(rows.find((r) => r.local_id === 'with-loc')!);

    expect(noLocDto.location).toBeUndefined();
    expect(withLocDto.location).toEqual({ lat: 37.5665, lng: 126.978, accuracyM: 12.5 });
  });

  it('androidIntegrityFlags는 JSON 직렬화/역직렬화를 거쳐도 값이 동일하다', async () => {
    const db = createNodeSqliteExecutor();
    await ensureSchema(db);
    const flags = { mockLocationSuspected: true, developerModeEnabled: false, rootedOrJailbroken: false };
    await enqueuePunch(db, baseInput({ androidIntegrityFlags: flags, platform: 'ANDROID' }));

    const dto = toCreatePunchInput((await listPending(db))[0]);
    expect(dto.androidIntegrityFlags).toEqual(flags);
    expect(dto.platform).toBe('ANDROID');
  });

  it('여러 번 ensureSchema를 호출해도(앱 재실행 시마다) 에러 없이 idempotent하다', async () => {
    const db = createNodeSqliteExecutor();
    await ensureSchema(db);
    await enqueuePunch(db, baseInput());
    await ensureSchema(db); // 재실행 시 App.tsx가 매번 호출 — 기존 데이터가 사라지면 안 된다.

    expect(await countPending(db)).toBe(1);
  });
});
