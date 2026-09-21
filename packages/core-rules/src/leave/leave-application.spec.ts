import { applyLeave } from './leave-application';

describe('applyLeave', () => {
  it('시나리오34: 승인된 연차(FULL) → 유급휴가로 확정, 미등록 알림 대상 제외', () => {
    const result = applyLeave({ unit: 'FULL', contractedDailyWorkMinutes: 480, status: 'APPROVED' });
    expect(result.paidLeaveMinutes).toBe(480);
    expect(result.confirmed).toBe(true);
    expect(result.excludeFromNoShowAlert).toBe(true);
  });

  it('시나리오35: 반차(오전, HALF_AM) → 4h(240분) 유급', () => {
    const result = applyLeave({ unit: 'HALF_AM', contractedDailyWorkMinutes: 480, status: 'APPROVED' });
    expect(result.paidLeaveMinutes).toBe(240);
  });

  it('반반차(QUARTER) → 2h(120분) 유급', () => {
    const result = applyLeave({ unit: 'QUARTER', contractedDailyWorkMinutes: 480, status: 'APPROVED' });
    expect(result.paidLeaveMinutes).toBe(120);
  });

  it('대기/반려 상태는 유급 확정되지 않는다', () => {
    expect(applyLeave({ unit: 'FULL', contractedDailyWorkMinutes: 480, status: 'PENDING' }).confirmed).toBe(false);
    expect(applyLeave({ unit: 'FULL', contractedDailyWorkMinutes: 480, status: 'REJECTED' }).paidLeaveMinutes).toBe(0);
  });
});
