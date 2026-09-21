import { Injectable } from '@nestjs/common';
import { AlertLog, AlertLogChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateAlertLogInput {
  notificationType: string;
  channel: AlertLogChannel;
  recipientEmployeeId: string;
  targetPeriod: string;
  stage: string;
  dedupKey: string;
  locale: string;
  payload: Record<string, unknown>;
  urgent: boolean;
}

export interface CreateIdempotentAlertLogResult {
  alertLog: AlertLog;
  duplicate: boolean;
}

/**
 * alert_log에 대한 유일한 접근 지점. 신원(dedupKey)은 punch_raw와 같은
 * "INSERT 먼저 시도 → 유니크 위반 캐치" 방식으로 보호하지만, 결과(result/
 * retryCount)는 correction_request.status처럼 발송 시도마다 갱신되는
 * 생애주기 필드다 — punch_raw의 "1회 INSERT" 철학과 이 지점만 다르다.
 */
@Injectable()
export class AlertLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIdempotent(input: CreateAlertLogInput): Promise<CreateIdempotentAlertLogResult> {
    try {
      const alertLog = await this.prisma.alertLog.create({
        data: {
          notificationType: input.notificationType,
          channel: input.channel,
          recipientEmployeeId: input.recipientEmployeeId,
          targetPeriod: input.targetPeriod,
          stage: input.stage,
          dedupKey: input.dedupKey,
          locale: input.locale,
          payload: input.payload as Prisma.InputJsonValue,
          urgent: input.urgent,
        },
      });
      return { alertLog, duplicate: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.alertLog.findUniqueOrThrow({ where: { dedupKey: input.dedupKey } });
        return { alertLog: existing, duplicate: true };
      }
      throw e;
    }
  }

  async findById(id: string): Promise<AlertLog> {
    return this.prisma.alertLog.findUniqueOrThrow({ where: { id } });
  }

  async markSuppressed(id: string): Promise<void> {
    await this.prisma.alertLog.update({
      where: { id },
      data: { result: 'SUPPRESSED', settledAt: new Date() },
    });
  }

  async markSuccess(id: string): Promise<void> {
    const now = new Date();
    await this.prisma.alertLog.update({
      where: { id },
      data: { result: 'SUCCESS', sentAt: now, settledAt: now },
    });
  }

  async markRetrying(id: string, error: string): Promise<void> {
    await this.prisma.alertLog.update({
      where: { id },
      data: { result: 'FAILED_RETRYING', retryCount: { increment: 1 }, lastError: error },
    });
  }

  async markFailedFinal(id: string): Promise<void> {
    await this.prisma.alertLog.update({
      where: { id },
      data: { result: 'FAILED_FINAL', settledAt: new Date() },
    });
  }

  /** STEP5-A: 본인 알림 이력 조회(self-scoped, requestedAt DESC 커서 페이지네이션). */
  async findByRecipient(recipientEmployeeId: string, before: Date | undefined, limit: number): Promise<AlertLog[]> {
    return this.prisma.alertLog.findMany({
      where: { recipientEmployeeId, ...(before ? { requestedAt: { lt: before } } : {}) },
      orderBy: { requestedAt: 'desc' },
      take: limit,
    });
  }
}
