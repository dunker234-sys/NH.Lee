import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().required(),
  // STEP12: 위치정보 파기 배치 전용 최소권한 DB 롤(retention_job)의 커넥션
  // 문자열 — app_rw(DATABASE_URL)와 물리적으로 분리한다.
  RETENTION_JOB_DATABASE_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  ACCESS_TOKEN_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL: Joi.string().default('14d'),

  MAX_FAILED_LOGIN_ATTEMPTS: Joi.number().integer().min(1).default(5),
  LOCKOUT_DURATION_MINUTES: Joi.number().integer().min(1).default(15),
  PASSWORD_MIN_LENGTH: Joi.number().integer().min(8).default(10),

  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().integer().default(6379),

  // AES-256-GCM 키 — 64자리 hex(32바이트).
  QR_TOTP_ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
  // STEP12: 개인정보 컬럼(EmployeeProtectedStatus.statusType) 암호화 전용 키.
  // QR_TOTP_ENCRYPTION_KEY와 절대 재사용하지 않는다(키 재사용 방지 원칙).
  PII_ENCRYPTION_KEY: Joi.string().hex().length(64).required(),

  // STEP12: 콤마 구분 오리진 allowlist. 비워두면(개발 기본값) 전체 허용 유지.
  CORS_ALLOWED_ORIGINS: Joi.string().optional().allow(''),

  // STEP10: 어댑터 종류 전환은 이 값 한 줄로 한다. 나머지 HR_SYNC_* 값은
  // 선택된 어댑터가 실제로 fetchAll()을 호출할 때 없으면 그때 실패한다
  // (어댑터 3종을 동시에 설정할 필요가 없으므로 전부 required로 만들지 않는다).
  HR_SYNC_ADAPTER_TYPE: Joi.string().valid('FILE', 'DB', 'API').default('FILE'),
  HR_SYNC_FILE_PATH: Joi.string().optional(),
  HR_SYNC_DB_CONNECTION_STRING: Joi.string().optional(),
  HR_SYNC_DB_QUERY: Joi.string().optional(),
  HR_SYNC_API_BASE_URL: Joi.string().optional(),
  HR_SYNC_API_AUTH_STRATEGY: Joi.string().valid('BEARER', 'OAUTH_CLIENT_CREDENTIALS').default('BEARER'),
  HR_SYNC_API_BEARER_TOKEN: Joi.string().optional(),
  HR_SYNC_API_OAUTH_TOKEN_URL: Joi.string().optional(),
  HR_SYNC_API_OAUTH_CLIENT_ID: Joi.string().optional(),
  HR_SYNC_API_OAUTH_CLIENT_SECRET: Joi.string().optional(),
}).unknown(true);
