// jest-e2e.json의 setupFiles로 테스트 프레임워크 로드 전에 실행된다.
// STEP12: AppThrottlerGuard가 이 값으로 rate limit을 건너뛴다(부하테스트류가
// 같은 루프백 IP에서 정상적으로 순간 버스트를 낸다 — 운영 제한을 그대로
// 적용하면 테스트 자체가 429로 막힌다).
process.env.NODE_ENV ??= 'test';
// 앱이 attendance(개발 DB)가 아니라 attendance_test에 app_rw로 연결하게 한다.
// connection_limit을 낮게 고정한다 — test/setup/db.ts의 adminPrisma와 같은 이유
// (Prisma 기본값이 CPU 코어수 기준이라 이 머신에서는 파일 하나당 최대 37개까지
// 열 수 있다). 앱은 매 파일 afterAll의 app.close()로 정상 종료 시 스스로
// 반납하지만, 비정상 종료(프로세스가 외부에서 죽는 경우 등) 시 남는 피해
// 범위를 줄이기 위해 여기서도 캡을 둔다.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://app_rw:app_rw_dev_password@localhost:5432/attendance_test?schema=public&connection_limit=10';

process.env.JWT_ACCESS_SECRET ??= 'e2e-test-access-secret-not-for-prod-32ch';
process.env.JWT_REFRESH_SECRET ??= 'e2e-test-refresh-secret-not-for-prod-32c';
process.env.ACCESS_TOKEN_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL ??= '14d';
process.env.MAX_FAILED_LOGIN_ATTEMPTS ??= '5';
process.env.LOCKOUT_DURATION_MINUTES ??= '15';
process.env.PASSWORD_MIN_LENGTH ??= '10';
process.env.PORT ??= '0';

// 로컬 Memurai(Redis 7.4 프로토콜 호환) — winget install -e --id Memurai.MemuraiDeveloper
process.env.REDIS_HOST ??= '127.0.0.1';
process.env.REDIS_PORT ??= '6379';

process.env.QR_TOTP_ENCRYPTION_KEY ??= 'a'.repeat(64);
// STEP12: PII_ENCRYPTION_KEY는 QR_TOTP_ENCRYPTION_KEY와 값이 절대 같으면 안
// 된다(키 재사용 금지) — 다른 반복 문자를 쓴다.
process.env.PII_ENCRYPTION_KEY ??= 'b'.repeat(64);
process.env.CORS_ALLOWED_ORIGINS ??= '';
process.env.RETENTION_JOB_DATABASE_URL ??=
  'postgresql://retention_job:retention_job_dev_password@localhost:5432/attendance_test?schema=public&connection_limit=3';
