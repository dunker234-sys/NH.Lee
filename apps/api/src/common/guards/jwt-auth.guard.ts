import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * 액세스 토큰 서명·만료만 검증한다. 여기서 나온 값은 "신뢰하지 않는 원본 JWT
 * 클레임"이므로 request.tokenClaims에 담는다 — 인가 판단에는 절대 쓰지 않는다
 * (그건 PrincipalGuard가 DB에서 새로 읽어 만드는 request.principal의 몫이다).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser, _info: unknown, context: ExecutionContext): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    const request = context.switchToHttp().getRequest();
    request.tokenClaims = user;
    return user;
  }
}
