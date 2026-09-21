import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationPolicy, NotificationPolicyResolverService } from '../../common/policy/notification-policy-resolver.service';
import { SystemContextService } from '../../common/principal/system-context.service';
import { AlertLogRepository } from './alert-log.repository';
import {
  NOTIFICATION_CHANNEL_SENDERS,
  NotificationChannelSender,
} from './channels/notification-channel-sender.interface';
import { DeviceTokenRepository } from './device-token.repository';
import { NotificationConsentService } from './notification-consent.service';
import { resolveTemplate } from './notification-types.registry';
import { NOTIFICATIONS_QUEUE_NAME, NotificationJobData } from './queue.constants';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function minuteOfDayKst(at: Date): number {
  const kst = new Date(at.getTime() + KST_OFFSET_MS);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

function isWithinQuietHours(policy: NotificationPolicy, at: Date): boolean {
  const minute = minuteOfDayKst(at);
  const { quietHoursStartMinuteOfDay: start, quietHoursEndMinuteOfDay: end } = policy;
  // 자정을 걸치는 구간(예: 22:00~06:00)과 걸치지 않는 구간을 모두 지원한다.
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
}

/**
 * 다른 직원의 device_token/policy_config를 조회해야 해서 SYSTEM 주체로
 * 실행한다(recalculation/fraud-detection 컨슈머와 동일한 패턴). 이번에는
 * 잡 ID 자체가 alertLog.id(진짜 UUID)라 SystemContextService.runAsSystem의
 * 세 번째 인자로 그대로 넘겨도 audit_log.job_id 제약과 충돌하지 않는다.
 */
@Processor(NOTIFICATIONS_QUEUE_NAME, { concurrency: 5 })
export class NotificationsConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationsConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertLogRepo: AlertLogRepository,
    private readonly deviceTokenRepo: DeviceTokenRepository,
    private readonly consentService: NotificationConsentService,
    private readonly policyResolver: NotificationPolicyResolverService,
    private readonly systemContext: SystemContextService,
    @Inject(NOTIFICATION_CHANNEL_SENDERS) private readonly senders: NotificationChannelSender[],
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    await this.systemContext.runAsSystem('alert_log', () => this.handle(job), job.id);
  }

  private async handle(job: Job<NotificationJobData>): Promise<void> {
    const { alertLogId, channel } = job.data;
    const alertLog = await this.alertLogRepo.findById(alertLogId);

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: alertLog.recipientEmployeeId },
      select: { locale: true, primarySiteId: true },
    });

    // 동의는 채널 불문 전면 옵트아웃 — urgent도 이 판단은 무시할 수 없다
    // (법적 성격의 판단이라 이 인프라 STEP이 대신 내릴 수 없다).
    if (await this.consentService.isSuppressed(alertLog.recipientEmployeeId)) {
      await this.alertLogRepo.markSuppressed(alertLogId);
      return;
    }

    // 조용시간은 PUSH만 대상, urgent는 예외(UX 배려일 뿐이라 긴급성이 이긴다).
    if (channel === 'PUSH' && !alertLog.urgent) {
      const policy = await this.policyResolver.resolve(employee.primarySiteId, new Date());
      if (isWithinQuietHours(policy, new Date())) {
        await this.alertLogRepo.markSuppressed(alertLogId);
        return;
      }
    }

    const sender = this.senders.find((s) => s.channel === channel);
    if (!sender) {
      throw new Error(`발송기가 등록되지 않은 채널입니다: ${channel}`);
    }

    const deviceTokens = channel === 'PUSH' ? await this.deviceTokenRepo.findValidByEmployee(alertLog.recipientEmployeeId) : [];
    const template = resolveTemplate(alertLog.notificationType, alertLog.locale);
    const vars = alertLog.payload as Record<string, unknown>;

    try {
      await sender.send({
        alertLog,
        deviceTokens,
        renderedTitle: template.title(vars),
        renderedBody: template.body(vars),
      });
      await this.alertLogRepo.markSuccess(alertLogId);
    } catch (err) {
      await this.alertLogRepo.markRetrying(alertLogId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<NotificationJobData> | undefined): Promise<void> {
    if (!job) return;
    const attemptsMax = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attemptsMax) {
      await this.alertLogRepo.markFailedFinal(job.data.alertLogId);
    }
  }

  /** BullMQ Worker의 'error' 이벤트는 리스너가 없으면 Node가 uncaught
   * exception으로 취급해 프로세스 크래시로 이어질 수 있다 — 반드시 하나는
   * 등록해 둔다. */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`BullMQ worker error: ${err.message}`, err.stack);
  }
}
