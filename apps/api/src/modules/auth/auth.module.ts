import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DeviceBindingService } from './device-binding.service';
import { PasswordPolicyService } from './password-policy';
import { RefreshTokenService } from './refresh-token.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // env.validation.ts(Joi)가 필수값으로 보증하므로 non-null 단언한다.
        secret: config.get<string>('jwt.accessSecret')!,
        // @types/jsonwebtoken의 expiresIn은 브랜드 문자열 타입(StringValue)을
        // 요구해 일반 string과 구조적으로 안 맞는다 — 런타임에는 "15m" 등
        // 문자열을 그대로 받아들이므로 타입만 캐스팅한다.
        signOptions: { expiresIn: config.get<string>('jwt.accessTtl') as never },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessStrategy, DeviceBindingService, RefreshTokenService, PasswordPolicyService],
  exports: [AuthService, DeviceBindingService],
})
export class AuthModule {}
