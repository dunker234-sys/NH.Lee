import { Injectable, Logger } from '@nestjs/common';
import { AccessLogResult, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessLogWriteInput {
  actorPrincipal: string;
  actorRole: string;
  orgScopeApplied: unknown;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestPath?: string;
  ipAddress?: string;
  result: AccessLogResult;
}

@Injectable()
export class AccessLogService {
  private readonly logger = new Logger('AccessLog');

  constructor(private readonly prisma: PrismaService) {}

  async write(input: AccessLogWriteInput): Promise<void> {
    try {
      await this.prisma.accessLog.create({
        data: {
          actorPrincipal: input.actorPrincipal,
          actorRole: input.actorRole,
          // org_scope_applied는 NOT NULL이다. 스코프가 아직 없는 요청(인증 전 401 등)은
          // SQL NULL이 아니라 JSON 리터럴 null(Prisma.JsonNull)을 저장해 제약을 만족시킨다.
          orgScopeApplied:
            input.orgScopeApplied === undefined
              ? Prisma.JsonNull
              : (input.orgScopeApplied as Prisma.InputJsonValue),
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          requestPath: input.requestPath,
          ipAddress: input.ipAddress,
          result: input.result,
        },
      });
    } catch (error) {
      // access_log 기록 실패가 실제 요청 처리를 막아서는 안 된다 — best-effort 로깅.
      this.logger.error('access_log 기록 실패', error instanceof Error ? error.stack : String(error));
    }
  }
}
