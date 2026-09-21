import { Injectable } from '@nestjs/common';
import { EmployeeProtectedStatusRepository } from '../../common/employee-protected-status/employee-protected-status.repository';
import { dateOnly } from '../../common/time/week.util';

/** §60⑥ 출근 간주 기간에 해당하는 EmployeeProtectedStatus.statusType 값 —
 * 근로자가 "신청"하는 휴가 유형이 아니라 HR이 등록하는 신상 상태다. */
export const DEEMED_ATTENDANCE_STATUS_TYPES = [
  'INDUSTRIAL_INJURY_LEAVE',
  'MATERNITY_LEAVE',
  'CHILDCARE_LEAVE',
  'REDUCED_WORKING_HOURS_CHILDCARE',
] as const;

@Injectable()
export class LeaveDeemedAttendanceService {
  constructor(private readonly protectedStatusRepo: EmployeeProtectedStatusRepository) {}

  /** [periodStart, periodEnd] 구간 안에서 §60⑥ 출근간주 기간과 겹치는
   * 일수를 계산한다(요구사항서4.3 §1 — 결근 처리하면 연차가 과소 산정됨). */
  async countDeemedAttendanceDays(employeeId: string, periodStart: string, periodEnd: string): Promise<number> {
    const candidates = await this.protectedStatusRepo.findActiveDecrypted(employeeId, {
      periodStart: dateOnly(periodStart),
      periodEnd: dateOnly(periodEnd),
    });
    const deemedTypes: readonly string[] = DEEMED_ATTENDANCE_STATUS_TYPES;
    const rows = candidates.filter((r) => deemedTypes.includes(r.statusType));

    const periodStartMs = dateOnly(periodStart).getTime();
    const periodEndMs = dateOnly(periodEnd).getTime();
    let totalDays = 0;
    for (const row of rows) {
      const overlapStart = Math.max(periodStartMs, row.effectiveStartDate.getTime());
      const overlapEndMs = row.effectiveEndDate ? row.effectiveEndDate.getTime() : periodEndMs;
      const overlapEnd = Math.min(periodEndMs, overlapEndMs);
      if (overlapEnd >= overlapStart) {
        totalDays += Math.floor((overlapEnd - overlapStart) / 86_400_000) + 1;
      }
    }
    return totalDays;
  }
}
