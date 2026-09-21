import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RECALCULATION_QUEUE_NAME, RecalculationJobData, recalculationJobId } from './queue.constants';
import { enumerateDates } from '../../common/time/week.util';

/**
 * STEP4(타각)/STEP6.5(근로 미제공 판정)/STEP7(스케줄)/STEP8(정정/휴가/연장)이
 * 실제로 생기면 그대로 호출할 안정적인 공개 진입점. 지금은 이 STEP의 e2e
 * 테스트가 DB에 데이터를 직접 넣은 뒤 이 메서드를 호출해 큐→컨슈머→집계
 * 경로를 검증한다.
 */
@Injectable()
export class RecalculationTriggerService {
  constructor(
    @InjectQueue(RECALCULATION_QUEUE_NAME) private readonly queue: Queue<RecalculationJobData>,
    private readonly prisma: PrismaService,
  ) {}

  async onPunchSaved(employeeId: string, workDate: string): Promise<void> {
    await this.enqueue(employeeId, workDate, 'PUNCH_SAVED');
  }

  async onCorrectionApproved(employeeId: string, workDate: string): Promise<void> {
    await this.enqueue(employeeId, workDate, 'CORRECTION_APPROVED');
  }

  async onLeaveApproved(employeeId: string, startDate: string, endDate: string): Promise<void> {
    for (const workDate of enumerateDates(startDate, endDate)) {
      await this.enqueue(employeeId, workDate, 'LEAVE_APPROVED');
    }
  }

  async onScheduleChanged(employeeId: string, workDate: string): Promise<void> {
    await this.enqueue(employeeId, workDate, 'SCHEDULE_CHANGED');
  }

  async onOvertimeOrDispatchApproved(employeeId: string, targetDate: string): Promise<void> {
    await this.enqueue(employeeId, targetDate, 'OVERTIME_OR_DISPATCH_APPROVED');
  }

  async onWorkNotProvidedJudged(employeeId: string, workDate: string): Promise<void> {
    await this.enqueue(employeeId, workDate, 'WORK_NOT_PROVIDED_JUDGED');
  }

  /**
   * 정책 변경 영향 범위 전체를 재계산 대상으로 잡는다. siteId=null이면 전사.
   * 미래 날짜는 아직 실적이 없어 재계산할 대상이 없으므로 오늘까지만 채운다.
   * ★ 갭: 대규모 사업장 전체 재계산은 잡 수가 커 §5에 문서화된 동시성=5
   * 병목의 영향을 가장 크게 받는 경로다 — 실제 배포 전 별도 스로틀링 검토 필요.
   */
  async onPolicyChanged(siteId: string | null, affectedFromDate: string): Promise<void> {
    const employees = await this.prisma.employee.findMany({
      where: siteId ? { primarySiteId: siteId } : {},
      select: { id: true },
    });
    const today = new Date().toISOString().slice(0, 10);
    if (affectedFromDate > today) return;

    for (const employee of employees) {
      for (const workDate of enumerateDates(affectedFromDate, today)) {
        await this.enqueue(employee.id, workDate, 'POLICY_CHANGED');
      }
    }
  }

  /**
   * 같은 (직원, 근로일)에 고정 잡 ID를 쓰는 건 짧은 시간 안의 중복 트리거를
   * 자연스럽게 접기 위해서다 — 그런데 BullMQ는 그 ID의 잡이 이미 존재하면
   * (완료 처리 중이라 아직 안 지워졌어도) add()를 조용히 무시한다. 승인 직후
   * 곧바로 취소하는 것처럼 같은 날짜를 아주 짧은 간격으로 두 번째 트리거하면,
   * 첫 잡의 실제 계산은 이미 끝났어도(daily 행은 이미 커밋됨) recalculateWeek/
   * Month 마무리 + BullMQ 자체의 완료 처리가 아직 안 끝난 그 찰나의 창에서
   * 두 번째 트리거가 이렇게 조용히 유실될 수 있다(실측으로 재현·확인한
   * 레이스 — STEP7 e2e에서 처음 드러남). 그래서 add() 전에 짧게 그 잡이
   * 실제로 처리 중/대기 중이 아닐 때까지 기다린다. 완료돼 이미 지워졌거나
   * 애초에 없었으면 즉시 통과해 지연이 없다.
   */
  private async enqueue(employeeId: string, workDate: string, reason: string): Promise<void> {
    const jobId = recalculationJobId(employeeId, workDate);
    await this.waitForPriorJobToSettle(jobId);
    await this.queue.add('recalculate', { employeeId, workDate, reason }, { jobId });
  }

  private async waitForPriorJobToSettle(jobId: string, timeoutMs = 10000, intervalMs = 50): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const existing = await this.queue.getJob(jobId);
      if (!existing) return;
      const state = await existing.getState();
      if (state !== 'active' && state !== 'waiting' && state !== 'delayed') return;
      if (Date.now() >= deadline) return; // 최선 노력 — 무한 대기하지 않는다
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
