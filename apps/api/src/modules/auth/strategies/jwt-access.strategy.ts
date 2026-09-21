import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * 액세스 토큰에 싣는 값은 이것뿐이다. role/scope는 절대 넣지 않는다 —
 * 인가 판단은 PrincipalGuard가 매 요청 DB에서 다시 계산한다 (STEP2 계획 참고).
 */
export interface AccessTokenClaims {
  sub: string; // employeeId
  employeeNo: string;
  deviceId: string;
  deviceTrust: boolean;
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  validate(payload: AccessTokenClaims): AccessTokenClaims {
    return payload;
  }
}
