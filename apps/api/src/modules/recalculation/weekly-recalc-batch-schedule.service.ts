import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { WEEKLY_RECALC_BATCH_QUEUE_NAME, WeeklyRecalcBatchJobData } from './weekly-recalc-batch.queue.constants';

const DAILY_JOB_ID = 'trigger-nightly-weekly-recalc-batch';
export const TRIGGER_NIGHTLY_BATCH_JOB_NAME = 'trigger-nightly-batch';

/**
 * no-show-schedule.service.ts와 같은 관례 — 신규 cron 라이브러리를 쓰지
 * 않고 BullMQ repeat를 그대로 쓴다. 매일 새벽 2시(KST)에 "오늘 기준 이번
 * 주 전 재직 직원 팬아웃"을 트리거하는 잡 하나를 올린다(요구사항서 4.4②
 * "매일 야간 정합성 배치"). 이 트리거 잡 자체는 employeeId가 없는
 * 팬아웃 신호일 뿐이고, WeeklyRecalcBatchConsumer가 이를 받아
 * enqueueForAllActiveEmployees()로 (직원×주) 잡을 실제로 펼친다.
 */
@Injectable()
export class WeeklyRecalcBatchScheduleService implements OnModuleInit {
  constructor(
    @InjectQueue(WEEKLY_RECALC_BATCH_QUEUE_NAME) private readonly queue: Queue<WeeklyRecalcBatchJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs();
    if (existing.some((j) => j.id === DAILY_JOB_ID)) return;

    await this.queue.add(
      TRIGGER_NIGHTLY_BATCH_JOB_NAME,
      {},
      { repeat: { pattern: '0 2 * * *', tz: 'Asia/Seoul' }, jobId: DAILY_JOB_ID },
    );
  }
}
