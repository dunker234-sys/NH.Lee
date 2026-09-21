import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * STEP12: e2e 테스트는 P95/부하 테스트처럼 같은 루프백 IP에서 정상적으로
 * 수십~수백 건을 순간적으로 쏜다 — 운영 rate limit을 그대로 적용하면
 * 테스트 자체가 429로 막힌다. NODE_ENV==='test'에서만 건너뛴다(운영/개발
 * 환경 동작은 그대로).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    return super.canActivate(context);
  }
}
