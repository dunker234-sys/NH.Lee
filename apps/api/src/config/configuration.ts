export interface AppConfig {
  port: number;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  auth: {
    maxFailedLoginAttempts: number;
    lockoutDurationMinutes: number;
    passwordMinLength: number;
  };
  redis: {
    host: string;
    port: number;
  };
  crypto: {
    qrTotpEncryptionKey: string;
  };
  hrSync: {
    adapterType: 'FILE' | 'DB' | 'API';
    file: {
      path: string;
    };
    db: {
      connectionString: string;
      query: string;
    };
    api: {
      baseUrl: string;
      authStrategy: 'BEARER' | 'OAUTH_CLIENT_CREDENTIALS';
      bearerToken: string;
      oauthTokenUrl: string;
      oauthClientId: string;
      oauthClientSecret: string;
    };
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTtl: process.env.REFRESH_TOKEN_TTL ?? '14d',
  },
  auth: {
    maxFailedLoginAttempts: parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS ?? '5', 10),
    lockoutDurationMinutes: parseInt(process.env.LOCKOUT_DURATION_MINUTES ?? '15', 10),
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH ?? '10', 10),
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  crypto: {
    // env.validation.ts(Joi)가 64자리 hex(32바이트)로 보증하므로 non-null 단언한다.
    qrTotpEncryptionKey: process.env.QR_TOTP_ENCRYPTION_KEY as string,
  },
  // STEP10: 어댑터 종류(FILE/DB/API) 전환은 HR_SYNC_ADAPTER_TYPE 한 줄로 한다.
  // 자동적용 임계값(hrSyncAutoApplyChangeRatioThreshold)은 법령 수치는
  // 아니지만 기존 운영 임계값(지오펜스 반경 등)과 동일하게 policy_config에서
  // 읽는다(CLAUDE.md 절대 규칙4) — 여기 두지 않는다.
  hrSync: {
    adapterType: (process.env.HR_SYNC_ADAPTER_TYPE ?? 'FILE') as 'FILE' | 'DB' | 'API',
    file: {
      path: process.env.HR_SYNC_FILE_PATH ?? '',
    },
    db: {
      connectionString: process.env.HR_SYNC_DB_CONNECTION_STRING ?? '',
      query: process.env.HR_SYNC_DB_QUERY ?? '',
    },
    api: {
      baseUrl: process.env.HR_SYNC_API_BASE_URL ?? '',
      authStrategy: (process.env.HR_SYNC_API_AUTH_STRATEGY ?? 'BEARER') as 'BEARER' | 'OAUTH_CLIENT_CREDENTIALS',
      bearerToken: process.env.HR_SYNC_API_BEARER_TOKEN ?? '',
      oauthTokenUrl: process.env.HR_SYNC_API_OAUTH_TOKEN_URL ?? '',
      oauthClientId: process.env.HR_SYNC_API_OAUTH_CLIENT_ID ?? '',
      oauthClientSecret: process.env.HR_SYNC_API_OAUTH_CLIENT_SECRET ?? '',
    },
  },
});
