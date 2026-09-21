import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { AlertLogChannel } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { canonicalJson, sha256 } from '../../common/crypto/hash.util';
import { AlertLogRepository } from './alert-log.repository';
import { resolveNotificationType } from './notification-types.registry';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from './queue.constants';

export interface NotifyOptions {
  targetPeriod?: string;
  stage?: string;
  channels?: AlertLogChannel[];
}

export interface NotifyResult {
  alertLogIds: string[];
}

function buildDedupKey(
  recipientEmployeeId: string,
  notificationType: string,
  channel: AlertLogChannel,
  targetPeriod: string,
  stage: string,
): string {
  return sha256(canonicalJson({ recipientEmployeeId, notificationType, channel, targetPeriod, stage }));
}

/**
 * STEP5~9가 그대로 호출할 공개 API(recalculation의 RecalculationTriggerService와
 * 같은 자리) — 멱등 적재 + 조건부 enqueue를 한 번에 한다. 별도 "트리거
 * 서비스" 간접 계층을 두지 않는다.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertLogRepo: AlertLogRepository,
    @InjectQueue(NOTIFICATIONS_QUEUE_NAME) private readonly queue: Queue<NotificationJobData>,
  ) {}

  async notify(
    type: string,
    recipientEmployeeId: string,
    payload: Record<string, unknown>,
    options: NotifyOptions = {},
  ): Promise<NotifyResult> {
    const def = resolveNotificationType(type);
    const channels = options.channels ?? def.defaultChannels;
    const targetPeriod = options.targetPeriod ?? '';
    const stage = options.stage ?? 'DEFAULT';

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: recipientEmployeeId },
      select: { locale: true },
    });

    const alertLogIds: string[] = [];
    for (const channel of channels) {
      const dedupKey = buildDedupKey(recipientEmployeeId, type, channel, targetPeriod, stage);
      const { alertLog, duplicate } = await this.alertLogRepo.createIdempotent({
        notificationType: type,
        channel,
        recipientEmployeeId,
        targetPeriod,
        stage,
        dedupKey,
        locale: employee.locale,
        payload,
        urgent: def.urgent,
      });
      alertLogIds.push(alertLog.id);

      if (!duplicate) {
        // alertLog.id(진짜 UUID)를 그대로 BullMQ 잡 ID로 쓴다 — 완료된 잡이
        // Redis에서 청소돼도(이 저장소 어디에도 removeOnComplete 오버라이드가
        // 없다) 재적재가 조용히 새 잡을 만들 위험이 없다. 중복 방지의 유일한
        // 방어선은 dedup_key 유니크 제약이지 BullMQ 잡 ID가 아니다.
        await this.queue.add('send', { alertLogId: alertLog.id, channel }, { jobId: alertLog.id });
      }
    }

    return { alertLogIds };
  }
}
