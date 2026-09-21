import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HrApiAuthStrategy } from './hr-api-auth-strategy.interface';

/** 고정 토큰(HR_SYNC_API_BEARER_TOKEN)을 매 요청에 그대로 싣는다. */
@Injectable()
export class BearerTokenAuthStrategy implements HrApiAuthStrategy {
  constructor(private readonly config: ConfigService) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = this.config.get<string>('hrSync.api.bearerToken');
    if (!token) {
      throw new Error('HR_SYNC_API_BEARER_TOKEN이 설정되지 않았습니다.');
    }
    return { Authorization: `Bearer ${token}` };
  }
}
