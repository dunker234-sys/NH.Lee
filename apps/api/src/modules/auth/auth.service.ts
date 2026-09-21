import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { DeviceBindingService } from './device-binding.service';
import { RefreshTokenService } from './refresh-token.service';
import { PasswordPolicyService } from './password-policy';
import { AccessTokenClaims } from './strategies/jwt-access.strategy';

export class AccountLockedError extends UnauthorizedException {
  constructor(lockedUntil: Date) {
    super({
      code: 'ACCOUNT_LOCKED',
      message: `로그인 실패 횟수를 초과해 계정이 잠겼습니다. ${lockedUntil.toISOString()} 이후 다시 시도하세요.`,
    });
  }
}

export class InvalidCredentialsError extends UnauthorizedException {
  constructor() {
    super({ code: 'INVALID_CREDENTIALS', message: '사번 또는 비밀번호가 올바르지 않습니다.' });
  }
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  deviceTrust: boolean;
  isNewDevice: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly deviceBinding: DeviceBindingService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly auditLog: AuditLogService,
  ) {}

  async login(employeeNo: string, password: string, deviceId: string): Promise<LoginResult> {
    const employee = await this.prisma.employee.findUnique({
      where: { employeeNo },
      include: { credential: true },
    });

    // 사번이 없거나 자격 증명이 없는 경우도 동일한 오류를 반환한다(사번 존재 여부 비노출).
    if (!employee || !employee.credential || employee.status !== 'ACTIVE') {
      throw new InvalidCredentialsError();
    }

    const credential = employee.credential;
    if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
      throw new AccountLockedError(credential.lockedUntil);
    }

    const passwordOk = await bcrypt.compare(password, credential.passwordHash);
    if (!passwordOk) {
      await this.recordFailedAttempt(employee.id, employee.employeeNo, employee.role);
      await this.auditLog.write({
        actorPrincipal: employee.employeeNo,
        actorRole: employee.role,
        eventType: 'LOGIN_FAILED',
        resourceType: 'employee_credential',
        resourceId: employee.id,
      });
      throw new InvalidCredentialsError();
    }

    await this.prisma.employeeCredential.update({
      where: { employeeId: employee.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    const { trusted, isNewDevice } = await this.deviceBinding.resolve(employee.id, deviceId);
    const accessToken = await this.signAccessToken(employee.id, employee.employeeNo, deviceId, trusted);
    const refresh = await this.refreshTokens.issue(employee.id, deviceId);

    await this.auditLog.write({
      actorPrincipal: employee.employeeNo,
      actorRole: employee.role,
      eventType: 'LOGIN_SUCCESS',
      resourceType: 'employee_credential',
      resourceId: employee.id,
      reason: isNewDevice ? (trusted ? '최초 로그인 기기 자동 등록' : '미등록 기기 로그인 — 차단하지 않음, LOW 레벨 대상') : undefined,
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      mustChangePassword: credential.mustChangePassword,
      deviceTrust: trusted,
      isNewDevice,
    };
  }

  async refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const rotated = await this.refreshTokens.rotate(rawRefreshToken);
    const [binding, employee] = await Promise.all([
      this.prisma.deviceBinding.findUnique({
        where: { employeeId_deviceId: { employeeId: rotated.employeeId, deviceId: rotated.deviceId } },
      }),
      this.prisma.employee.findUniqueOrThrow({ where: { id: rotated.employeeId } }),
    ]);

    const accessToken = await this.signAccessToken(
      rotated.employeeId,
      employee.employeeNo,
      rotated.deviceId,
      binding?.trusted ?? false,
    );

    return { accessToken, refreshToken: rotated.token };
  }

  async changePassword(employeeId: string, currentPassword: string, newPassword: string): Promise<void> {
    const credential = await this.prisma.employeeCredential.findUniqueOrThrow({ where: { employeeId } });

    const ok = await bcrypt.compare(currentPassword, credential.passwordHash);
    if (!ok) throw new InvalidCredentialsError();

    this.passwordPolicy.validate(newPassword);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.employeeCredential.update({
      where: { employeeId },
      data: { passwordHash, mustChangePassword: false, passwordUpdatedAt: new Date() },
    });

    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    await this.auditLog.write({
      actorPrincipal: employee.employeeNo,
      actorRole: employee.role,
      eventType: 'PASSWORD_CHANGED',
      resourceType: 'employee_credential',
      resourceId: employeeId,
    });
  }

  private async recordFailedAttempt(employeeId: string, employeeNo: string, role: string): Promise<void> {
    const maxAttempts = this.config.get<number>('auth.maxFailedLoginAttempts', 5);
    const lockoutMinutes = this.config.get<number>('auth.lockoutDurationMinutes', 15);

    // increment는 DB 레벨 원자적 연산이다 — 동시 실패 로그인 시도로 인한 카운트 경합을 막는다.
    const updated = await this.prisma.employeeCredential.update({
      where: { employeeId },
      data: { failedLoginAttempts: { increment: 1 } },
    });

    if (updated.failedLoginAttempts >= maxAttempts) {
      await this.prisma.employeeCredential.update({
        where: { employeeId },
        data: { lockedUntil: new Date(Date.now() + lockoutMinutes * 60_000) },
      });
      await this.auditLog.write({
        actorPrincipal: employeeNo,
        actorRole: role,
        eventType: 'ACCOUNT_LOCKED',
        resourceType: 'employee_credential',
        resourceId: employeeId,
      });
    }
  }

  private async signAccessToken(
    employeeId: string,
    employeeNo: string,
    deviceId: string,
    deviceTrust: boolean,
  ): Promise<string> {
    const payload: AccessTokenClaims = { sub: employeeId, employeeNo, deviceId, deviceTrust };
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret')!,
      expiresIn: this.config.get<string>('jwt.accessTtl') as never,
    });
  }
}
