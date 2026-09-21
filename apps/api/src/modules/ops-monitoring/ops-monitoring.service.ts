import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RECALCULATION_QUEUE_NAME } from '../recalculation/queue.constants';
import { WEEKLY_RECALC_BATCH_QUEUE_NAME } from '../recalculation/weekly-recalc-batch.queue.constants';
import { MONTHLY_RECALC_BATCH_QUEUE_NAME } from '../recalculation/monthly-recalc-batch.queue.constants';
import { FRAUD_DETECTION_QUEUE_NAME } from '../fraud-detection/queue.constants';
import { WEEKLY_ALERT_QUEUE_NAME } from '../weekly-alert/queue.constants';
import { NOTIFICATIONS_QUEUE_NAME } from '../notifications/queue.constants';
import { NO_SHOW_DETECTION_QUEUE_NAME } from '../no-show-detection/queue.constants';
import { HR_SYNC_QUEUE_NAME } from '../hr-sync/queue.constants';
import { AUDIT_MERKLE_SEAL_QUEUE_NAME } from '../audit-integrity/queue.constants';
import { PUNCH_LOCATION_RETENTION_QUEUE_NAME } from '../retention/queue.constants';

function todayKst(): string {
  const kstMs = Date.now() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10);
}

export interface QueueHealth {
  queueName: string;
  completed: number;
  failed: number;
  successRatePercent: number | null;
  failedBacklog: number;
}

export interface OpsMonitoringSummary {
  /** 타각 실패율(%) — access_log의 punches 리소스 DENIED 비율(근사치, 아래 참고). */
  punchFailureRatePercent: number | null;
  /** 미등록 건수(오늘) — dashboard.service.ts와 동일 쿼리 재사용. */
  todayNoShowCount: number;
  /** 미승인 실적 미판정 건수 — dashboard.service.ts와 동일 쿼리 재사용. */
  unapprovedUnjudgedCount: number;
  /** 알림 발송 성공률(%) — 최근 24시간 settled(결착)된 alert_log 기준. */
  notificationSuccessRatePercent: number | null;
  /** 배치 성공률(%) — 아래 큐별 completed/failed 합산 기준. */
  batchSuccessRatePercent: number | null;
  /** DLQ 적체 — BullMQ 네이티브 failed 목록이 곧 DLQ(기존 컨벤션). */
  totalFailedBacklog: number;
  queues: QueueHealth[];
}

/**
 * STEP12: 실 클라우드/관측 플랫폼이 이 세션에 없어 Prometheus/Grafana/
 * @nestjs/terminus 풀스택은 채택하지 않는다(수신자 없는 /metrics는
 * 무의미) — 경량 인증 JSON 엔드포인트로 6개 지표를 노출한다. 실서비스
 * 전환 시 이 엔드포인트를 Prometheus exporter로 대체/보완할 수 있다
 * (docs/INCIDENT_RUNBOOK.md 참고, 이번 STEP 범위 밖).
 */
@Injectable()
export class OpsMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(RECALCULATION_QUEUE_NAME) private readonly recalcQueue: Queue,
    @InjectQueue(WEEKLY_RECALC_BATCH_QUEUE_NAME) private readonly weeklyBatchQueue: Queue,
    @InjectQueue(MONTHLY_RECALC_BATCH_QUEUE_NAME) private readonly monthlyBatchQueue: Queue,
    @InjectQueue(FRAUD_DETECTION_QUEUE_NAME) private readonly fraudQueue: Queue,
    @InjectQueue(WEEKLY_ALERT_QUEUE_NAME) private readonly weeklyAlertQueue: Queue,
    @InjectQueue(NOTIFICATIONS_QUEUE_NAME) private readonly notificationsQueue: Queue,
    @InjectQueue(NO_SHOW_DETECTION_QUEUE_NAME) private readonly noShowQueue: Queue,
    @InjectQueue(HR_SYNC_QUEUE_NAME) private readonly hrSyncQueue: Queue,
    @InjectQueue(AUDIT_MERKLE_SEAL_QUEUE_NAME) private readonly auditMerkleSealQueue: Queue,
    @InjectQueue(PUNCH_LOCATION_RETENTION_QUEUE_NAME) private readonly retentionQueue: Queue,
  ) {}

  async getSummary(): Promise<OpsMonitoringSummary> {
    const [punchFailureRatePercent, todayNoShowCount, unapprovedUnjudgedCount, notificationSuccessRatePercent, queues] =
      await Promise.all([
        this.computePunchFailureRate(),
        this.computeTodayNoShowCount(),
        this.computeUnapprovedUnjudgedCount(),
        this.computeNotificationSuccessRate(),
        this.computeQueueHealth(),
      ]);

    const totalCompleted = queues.reduce((sum, q) => sum + q.completed, 0);
    const totalFailed = queues.reduce((sum, q) => sum + q.failed, 0);
    const batchSuccessRatePercent =
      totalCompleted + totalFailed > 0 ? Math.round((totalCompleted / (totalCompleted + totalFailed)) * 1000) / 10 : null;
    const totalFailedBacklog = queues.reduce((sum, q) => sum + q.failedBacklog, 0);

    return {
      punchFailureRatePercent,
      todayNoShowCount,
      unapprovedUnjudgedCount,
      notificationSuccessRatePercent,
      batchSuccessRatePercent,
      totalFailedBacklog,
      queues,
    };
  }

  /**
   * access_log는 SUCCESS(성공 응답)와 DENIED(401/403/조직스코프 누락)만
   * 기록한다(AccessLogInterceptor/AllExceptionsFilter 관례) — 검증 실패
   * (400) 등 다른 실패 유형은 잡히지 않는, 인증·인가 실패 비율에 가까운
   * 근사치다(기존 dashboard.service.ts의 fraudReviewQueueCount와 같은
   * 종류의 알려진 한계).
   */
  private async computePunchFailureRate(): Promise<number | null> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [success, denied] = await Promise.all([
      this.prisma.accessLog.count({ where: { resourceType: 'punches', result: 'SUCCESS', occurredAt: { gte: since } } }),
      this.prisma.accessLog.count({ where: { resourceType: 'punches', result: 'DENIED', occurredAt: { gte: since } } }),
    ]);
    const total = success + denied;
    return total > 0 ? Math.round((denied / total) * 1000) / 10 : null;
  }

  private async computeTodayNoShowCount(): Promise<number> {
    const todayDate = new Date(`${todayKst()}T00:00:00.000Z`);
    return this.prisma.noShowNotificationTarget.count({ where: { workDate: todayDate } });
  }

  private async computeUnapprovedUnjudgedCount(): Promise<number> {
    return this.prisma.attendanceDaily.count({ where: { status: 'UNAPPROVED_ACTUAL' } });
  }

  private async computeNotificationSuccessRate(): Promise<number | null> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.prisma.alertLog.groupBy({
      by: ['result'],
      where: { settledAt: { gte: since } },
      _count: { _all: true },
    });
    const success = rows.find((r) => r.result === 'SUCCESS')?._count._all ?? 0;
    const settledTotal = rows.reduce((sum, r) => sum + r._count._all, 0);
    return settledTotal > 0 ? Math.round((success / settledTotal) * 1000) / 10 : null;
  }

  private async computeQueueHealth(): Promise<QueueHealth[]> {
    const queues: [string, Queue][] = [
      [RECALCULATION_QUEUE_NAME, this.recalcQueue],
      [WEEKLY_RECALC_BATCH_QUEUE_NAME, this.weeklyBatchQueue],
      [MONTHLY_RECALC_BATCH_QUEUE_NAME, this.monthlyBatchQueue],
      [FRAUD_DETECTION_QUEUE_NAME, this.fraudQueue],
      [WEEKLY_ALERT_QUEUE_NAME, this.weeklyAlertQueue],
      [NOTIFICATIONS_QUEUE_NAME, this.notificationsQueue],
      [NO_SHOW_DETECTION_QUEUE_NAME, this.noShowQueue],
      [HR_SYNC_QUEUE_NAME, this.hrSyncQueue],
      [AUDIT_MERKLE_SEAL_QUEUE_NAME, this.auditMerkleSealQueue],
      [PUNCH_LOCATION_RETENTION_QUEUE_NAME, this.retentionQueue],
    ];

    return Promise.all(
      queues.map(async ([queueName, queue]) => {
        const counts = await queue.getJobCounts('completed', 'failed');
        const completed = counts.completed ?? 0;
        const failed = counts.failed ?? 0;
        return {
          queueName,
          completed,
          failed,
          successRatePercent: completed + failed > 0 ? Math.round((completed / (completed + failed)) * 1000) / 10 : null,
          failedBacklog: failed,
        };
      }),
    );
  }
}
