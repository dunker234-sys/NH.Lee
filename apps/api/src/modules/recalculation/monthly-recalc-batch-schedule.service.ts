import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MONTHLY_RECALC_BATCH_QUEUE_NAME, MonthlyRecalcBatchJobData } from './monthly-recalc-batch.queue.constants';

const MONTHLY_JOB_ID = 'trigger-nightly-monthly-recalc-batch';
export const TRIGGER_MONTHLY_BATCH_JOB_NAME = 'trigger-monthly-batch';

/**
 * STEP12: weekly-recalc-batch-schedule.service.ts와 같은 관례(BullMQ repeat,
 * 신규 cron 라이브러리 미사용). 매일 점진적으로 attendance_monthly를 갱신하는
 * recalculateSingleDay()의 인라인 호출과 달리, 이 배치는 **월마감 직전
 * 완전성 재검증** 목적이다 — 다음 달 1일 02:30 KST(주간 배치 02:00 직후,
 * 커넥션 경합 회피)에 방금 마감된 달을 전 재직 직원 대상으로 재계산한다.
 */
@Injectable()
export class MonthlyRecalcBatchScheduleService implements OnModuleInit {
  constructor(@InjectQueue(MONTHLY_RECALC_BATCH_QUEUE_NAME) private readonly queue: Queue<MonthlyRecalcBatchJobData>) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs();
    if (existing.some((j) => j.id === MONTHLY_JOB_ID)) return;

    await this.queue.add(
      TRIGGER_MONTHLY_BATCH_JOB_NAME,
      {},
      { repeat: { pattern: '30 2 1 * *', tz: 'Asia/Seoul' }, jobId: MONTHLY_JOB_ID },
    );
  }
}
