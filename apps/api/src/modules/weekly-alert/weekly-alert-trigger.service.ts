import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { WEEKLY_ALERT_QUEUE_NAME, WeeklyAlertJobData } from './queue.constants';

/**
 * RecalculationConsumer(초당 수백 건까지 몰릴 수 있는 타각 처리 경로)와
 * WeeklyOvertimeAlertService(Postgres policy_config·attendance_weekly 조회를
 * 포함하는 무거운 평가)를 분리하는 얇은 트리거다. RecalculationConsumer가
 * 이 서비스를 직접 호출하지 않고 별도 큐(동시성 낮음, weekly-alert.consumer.ts
 * 참고)로 넘기는 이유: 재계산 자체와 같은 커넥션 풀을 두고 경쟁하면 타각
 * API의 P95(STEP4 완료조건)가 흔들린다 — 실측으로 확인된 문제라 RECALCULATION_
 * QUEUE_NAME과 물리적으로 분리했다.
 *
 * jobId를 (employeeId, weekStartDate)로 고정해, 같은 주에 여러 타각이
 * 연달아 들어와도 아직 처리되지 않은 평가 잡은 중복 적재되지 않는다
 * (RecalculationModule의 removeOnComplete:true와 같은 이유 — 이미 완료된
 * 잡은 큐에서 지워지므로 다음 재트리거가 새 잡으로 들어간다).
 */
@Injectable()
export class WeeklyAlertTriggerService {
  constructor(@InjectQueue(WEEKLY_ALERT_QUEUE_NAME) private readonly queue: Queue<WeeklyAlertJobData>) {}

  async onWeeklyRecalculated(employeeId: string, weekStartDate: string): Promise<void> {
    const jobId = `${employeeId}_${weekStartDate}`;
    await this.queue.add('evaluate', { employeeId, weekStartDate }, { jobId });
  }
}
