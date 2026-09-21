import { synthesizePayrollStatement, PayrollStatementSourceDay } from './payroll-statement-synthesis';

function day(overrides: Partial<PayrollStatementSourceDay> & { workDate: string }): PayrollStatementSourceDay {
  return {
    scheduledWorkMinutes: 480,
    approvedOvertimeMinutes: 0,
    unapprovedOvertimeMinutes: 0,
    nightWorkMinutes: 0,
    holidayWorkMinutesNormal: 0,
    holidayWorkMinutesExcess: 0,
    latenessMinutes: 0,
    earlyLeaveMinutes: 0,
    isAbsence: false,
    ...overrides,
  };
}

describe('synthesizePayrollStatement — 임금대장 항목 합성', () => {
  it('MONTHLY 레이아웃은 월 전체를 1행으로 합산한다', () => {
    const result = synthesizePayrollStatement({
      layoutType: 'MONTHLY',
      days: [
        day({ workDate: '2026-08-03', approvedOvertimeMinutes: 60 }),
        day({ workDate: '2026-08-04', unapprovedOvertimeMinutes: 30, latenessMinutes: 5 }),
        day({ workDate: '2026-08-05', isAbsence: true, scheduledWorkMinutes: 0 }),
      ],
      leaveDays: [
        { date: '2026-08-10', paid: true, deductedDays: 1 },
        { date: '2026-08-11', paid: false, deductedDays: 1 },
      ],
      weeklyPaidRest: [
        { weekStartDate: '2026-08-03', eligible: true, minutes: 480 },
        { weekStartDate: '2026-08-10', eligible: false, minutes: 0 },
      ],
    });

    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    expect(line.workDate).toBeUndefined();
    expect(line.approvedOvertimeMinutes).toBe(60);
    expect(line.unapprovedOvertimeMinutes).toBe(30);
    expect(line.absenceDays).toBe(1);
    expect(line.latenessDays).toBe(1);
    expect(line.paidLeaveDays).toBe(1);
    expect(line.unpaidLeaveDays).toBe(1);
    expect(line.weeklyPaidRestEligibleCount).toBe(1);
    expect(line.weeklyPaidRestMinutes).toBe(480);
  });

  it('DAILY(일용) 레이아웃은 일자별로 N행을 산출하고 주휴 항목은 0으로 둔다', () => {
    const result = synthesizePayrollStatement({
      layoutType: 'DAILY',
      days: [
        day({ workDate: '2026-08-04', approvedOvertimeMinutes: 30 }),
        day({ workDate: '2026-08-03' }),
      ],
      leaveDays: [],
      weeklyPaidRest: [{ weekStartDate: '2026-08-03', eligible: true, minutes: 480 }],
    });

    expect(result.lines).toHaveLength(2);
    // 날짜순 정렬 확인
    expect(result.lines[0].workDate).toBe('2026-08-03');
    expect(result.lines[1].workDate).toBe('2026-08-04');
    expect(result.lines[1].approvedOvertimeMinutes).toBe(30);
    for (const line of result.lines) {
      expect(line.weeklyPaidRestEligibleCount).toBe(0);
      expect(line.weeklyPaidRestMinutes).toBe(0);
    }
  });

  it('미승인 연장근로시간은 승인 연장근로시간과 절대 합쳐지거나 0이 되지 않는다(CLAUDE.md 절대규칙2 회귀테스트)', () => {
    const result = synthesizePayrollStatement({
      layoutType: 'MONTHLY',
      days: [day({ workDate: '2026-08-03', approvedOvertimeMinutes: 60, unapprovedOvertimeMinutes: 90 })],
      leaveDays: [],
      weeklyPaidRest: [],
    });
    const line = result.lines[0];
    expect(line.approvedOvertimeMinutes).toBe(60);
    expect(line.unapprovedOvertimeMinutes).toBe(90);
    expect(line.approvedOvertimeMinutes + line.unapprovedOvertimeMinutes).toBe(150);
  });
});
