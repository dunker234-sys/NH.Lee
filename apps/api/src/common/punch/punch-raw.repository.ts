import { Injectable } from '@nestjs/common';
import { Prisma, PunchRaw, PunchType, RegistrationMethod, VerificationLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrgScope } from '../scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../scope/scope.util';

export interface CreatePunchRawInput {
  employeeId: string;
  siteId: string;
  punchType: PunchType;
  recordedAt: Date;
  workDate: Date;
  idempotencyKey: string;
  verificationLevel: VerificationLevel;
  registrationMethod: RegistrationMethod;
  deviceId: string;
  integrityFlags?: string[];
  clientEventId?: string;
  reviewNote?: string;
}

export interface CreateIdempotentResult {
  punch: PunchRaw;
  duplicate: boolean;
}

/**
 * punch_raw(원본 타각)에 대한 애플리케이션의 유일한 접근 지점이다.
 * ★ update/delete 메서드가 의도적으로 존재하지 않는다 — CLAUDE.md 절대 규칙 1
 * (append-only)을 코드 레벨에서도 보장한다. ADMIN이라 해도 이 리포지토리를 통해서는
 * 원본을 고칠 방법이 없다. DB 레벨 강제(app_rw 권한 회수)는 STEP 1의
 * roles_post_migrate.sql을 참고 — 이 두 방어선은 서로 다른 계층에서 독립적으로 작동한다.
 */
@Injectable()
export class PunchRawRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePunchRawInput): Promise<PunchRaw> {
    return this.prisma.punchRaw.create({ data: this.toCreateData(input) });
  }

  /**
   * "먼저 SELECT로 확인 후 INSERT"가 아니라 INSERT를 먼저 시도하고 유니크
   * 제약 위반을 캐치한다 — 동시에 도착한 두 개의 동일 요청이 둘 다 "중복
   * 아님"으로 오판하는 TOCTOU를 막는다. 어느 쪽이 이기든 정확히 1행만 남고,
   * 진 쪽은 이긴 쪽의 행을 재조회해 받는다.
   */
  async createIdempotent(input: CreatePunchRawInput): Promise<CreateIdempotentResult> {
    try {
      const punch = await this.prisma.punchRaw.create({ data: this.toCreateData(input) });
      return { punch, duplicate: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.punchRaw.findUniqueOrThrow({
          where: { idempotencyKey: input.idempotencyKey },
        });
        return { punch: existing, duplicate: true };
      }
      throw e;
    }
  }

  private toCreateData(input: CreatePunchRawInput): Prisma.PunchRawUncheckedCreateInput {
    return {
      employeeId: input.employeeId,
      siteId: input.siteId,
      punchType: input.punchType,
      recordedAt: input.recordedAt,
      workDate: input.workDate,
      idempotencyKey: input.idempotencyKey,
      verificationLevel: input.verificationLevel,
      registrationMethod: input.registrationMethod,
      deviceId: input.deviceId,
      integrityFlags: input.integrityFlags ?? [],
      // STEP8: integrityFlags.length를 insert 시점에 비정규화(리포트용 집계
      // 편의). punch_raw는 append-only라 이후 이 값을 갱신할 방법이 없다 —
      // 반드시 insert 시점에 정확히 채워야 한다.
      integrityFlagCount: input.integrityFlags?.length ?? 0,
      clientEventId: input.clientEventId,
      reviewNote: input.reviewNote,
    };
  }

  async findMany(scope: OrgScope, filter: { employeeId?: string; siteId?: string } = {}): Promise<PunchRaw[]> {
    assertScope(scope);
    if (filter.siteId) {
      assertSiteInScope(scope, filter.siteId);
      return this.prisma.punchRaw.findMany({
        where: { employeeId: filter.employeeId, siteId: filter.siteId },
        orderBy: { recordedAt: 'desc' },
      });
    }

    return this.prisma.punchRaw.findMany({
      where: {
        employeeId: filter.employeeId,
        siteId: scope.kind === 'SITES' ? { in: scope.siteIds } : undefined,
      },
      orderBy: { recordedAt: 'desc' },
    });
  }
}
