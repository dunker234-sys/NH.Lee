import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HrApiAuthStrategy } from './hr-api-auth-strategy.interface';

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

/**
 * OAuth2 client_credentials 흐름. 토큰을 메모리에 캐시하고 만료 60초 전부터
 * 갱신한다 — 매 폴링 사이클(야간 배치 1회, 수동 실행 1회)마다 새로 발급받을
 * 필요는 없다.
 */
@Injectable()
export class OAuthClientCredentialsAuthStrategy implements HrApiAuthStrategy {
  private cached: CachedToken | null = null;

  constructor(private readonly config: ConfigService) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.cached && this.cached.expiresAtMs > Date.now() + 60_000) {
      return { Authorization: `Bearer ${this.cached.accessToken}` };
    }

    const tokenUrl = this.config.get<string>('hrSync.api.oauthTokenUrl');
    const clientId = this.config.get<string>('hrSync.api.oauthClientId');
    const clientSecret = this.config.get<string>('hrSync.api.oauthClientSecret');
    if (!tokenUrl || !clientId || !clientSecret) {
      throw new Error('HR_SYNC_API_OAUTH_TOKEN_URL/CLIENT_ID/CLIENT_SECRET이 설정되지 않았습니다.');
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    });
    if (!response.ok) {
      throw new Error(`OAuth 토큰 발급 실패: HTTP ${response.status}`);
    }
    const body = (await response.json()) as { access_token: string; expires_in?: number };
    this.cached = {
      accessToken: body.access_token,
      expiresAtMs: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
    return { Authorization: `Bearer ${this.cached.accessToken}` };
  }
}
