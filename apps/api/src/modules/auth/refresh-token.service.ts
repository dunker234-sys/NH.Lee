import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { sha256 } from '../../common/crypto/hash.util';
import { parseDurationMs } from '../../common/time/duration.util';

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export class InvalidRefreshTokenError extends UnauthorizedException {
  constructor() {
    super({ code: 'INVALID_REFRESH_TOKEN', message: '유효하지 않은 리프레시 토큰입니다.' });
  }
}

export class RefreshTokenReusedError extends UnauthorizedException {
  constructor() {
    super({
      code: 'REFRESH_TOKEN_REUSED',
      message: '리프레시 토큰 재사용이 감지되어 세션이 무효화되었습니다. 다시 로그인해주세요.',
    });
  }
}

export class RefreshTokenExpiredError extends UnauthorizedException {
  constructor() {
    super({ code: 'REFRESH_TOKEN_EXPIRED', message: '리프레시 토큰이 만료되었습니다.' });
  }
}

/**
 * 리프레시 토큰은 bcrypt가 아니라 SHA-256으로 해시해 저장한다 — 이미 고엔트로피
 * 랜덤값이라 느린 해시가 필요 없고, 오히려 유니크 인덱스로 바로 조회해야 한다.
 * 회전 체인(replacedByTokenId)을 유지하는 이유는 재사용 탐지다: 이미 폐기된
 * 토큰 해시가 다시 들어오면 탈취 신호로 보고 해당 직원·기기의 체인을 전부
 * 무효화한다.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  async issue(employeeId: string, deviceId: string): Promise<IssuedRefreshToken> {
    const raw = randomBytes(48).toString('hex');
    const ttlMs = parseDurationMs(this.config.get<string>('jwt.refreshTtl', '14d'));
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.prisma.refreshToken.create({
      data: { employeeId, deviceId, tokenHash: sha256(raw), expiresAt },
    });

    return { token: raw, expiresAt };
  }

  async rotate(rawToken: string): Promise<{ employeeId: string; deviceId: string } & IssuedRefreshToken> {
    const tokenHash = sha256(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) throw new InvalidRefreshTokenError();

    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { employeeId: existing.employeeId, deviceId: existing.deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditLog.write({
        actorPrincipal: existing.employeeId,
        actorRole: 'EMPLOYEE',
        eventType: 'TOKEN_REUSE_DETECTED',
        resourceType: 'refresh_token',
        resourceId: existing.id,
        reason: `폐기된 리프레시 토큰 재사용 시도 — employeeId=${existing.employeeId}, deviceId=${existing.deviceId}의 전체 토큰 체인을 무효화했습니다.`,
      });
      throw new RefreshTokenReusedError();
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new RefreshTokenExpiredError();
    }

    const next = await this.issue(existing.employeeId, existing.deviceId);
    const nextRow = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(next.token) } });

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByTokenId: nextRow?.id },
    });

    return { employeeId: existing.employeeId, deviceId: existing.deviceId, ...next };
  }

  async revokeAllForDevice(employeeId: string, deviceId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { employeeId, deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
