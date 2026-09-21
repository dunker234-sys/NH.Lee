import { diffHrRecords, ExistingEmployeeSnapshot } from './hr-sync-diff';
import { NormalizedHrRecord } from './hr-sync-normalizer';

function normalized(overrides: Partial<NormalizedHrRecord> = {}): NormalizedHrRecord {
  return {
    employeeNo: 'E1000',
    name: '홍길동',
    siteId: 'site-a',
    hireDate: '2026-01-02',
    employmentType: 'REGULAR',
    effectiveDate: '2026-02-01',
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingEmployeeSnapshot> = {}): ExistingEmployeeSnapshot {
  return {
    id: 'uuid-1',
    employeeNo: 'E1000',
    name: '홍길동',
    siteId: 'site-a',
    department: null,
    jobTitle: null,
    employmentType: 'REGULAR',
    hireDate: '2026-01-02',
    resignationDate: null,
    contractedWorkMinutes: null,
    managerEmployeeNo: null,
    hrSourceEffectiveDate: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('diffHrRecords — 요구사항서 5장③ 신규/변경/퇴사 분류', () => {
  it('DB에 없는 사번은 NEW로 분류된다', () => {
    const { entries } = diffHrRecords([normalized()], new Map());
    expect(entries).toEqual([{ changeType: 'NEW', employeeNo: 'E1000', after: normalized() }]);
  });

  it('필드가 같으면 아무 항목도 만들지 않는다', () => {
    const { entries } = diffHrRecords([normalized()], new Map([['E1000', existing()]]));
    expect(entries).toHaveLength(0);
  });

  it('부서/직위/사업장/고용형태/소정근로시간 변경은 CHANGED로 분류된다', () => {
    const { entries } = diffHrRecords(
      [normalized({ department: '조리팀' })],
      new Map([['E1000', existing()]]),
    );
    expect(entries).toEqual([
      { changeType: 'CHANGED', employeeNo: 'E1000', before: existing(), after: normalized({ department: '조리팀' }) },
    ]);
  });

  it('상위 결재자(managerEmployeeNo) 변경도 CHANGED로 분류된다', () => {
    const { entries } = diffHrRecords(
      [normalized({ managerEmployeeNo: 'MGR1' })],
      new Map([['E1000', existing({ managerEmployeeNo: null })]]),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].changeType).toBe('CHANGED');
  });

  it('피드에 퇴사일이 새로 채워지면 DEPARTED로 분류된다', () => {
    const { entries } = diffHrRecords(
      [normalized({ resignationDate: '2026-02-10' })],
      new Map([['E1000', existing()]]),
    );
    expect(entries).toEqual([
      { changeType: 'DEPARTED', employeeNo: 'E1000', before: existing(), resignationDate: '2026-02-10' },
    ]);
  });

  it('ACTIVE인데 피드에서 아예 빠지면 DEPARTED(resignationDate=null)로 분류된다', () => {
    const { entries } = diffHrRecords([], new Map([['E1000', existing()]]));
    expect(entries).toEqual([{ changeType: 'DEPARTED', employeeNo: 'E1000', before: existing(), resignationDate: null }]);
  });

  it('이미 RESIGNED인 직원은 피드에서 빠져도 DEPARTED로 다시 분류되지 않는다', () => {
    const { entries } = diffHrRecords([], new Map([['E1000', existing({ status: 'RESIGNED' })]]));
    expect(entries).toHaveLength(0);
  });

  it('기존 hrSourceEffectiveDate보다 오래된 피드는 건너뛴다(최신 수동정정 보호)', () => {
    const { entries, staleSkippedEmployeeNos } = diffHrRecords(
      [normalized({ department: '조리팀', effectiveDate: '2026-01-01' })],
      new Map([['E1000', existing({ hrSourceEffectiveDate: '2026-01-15' })]]),
    );
    expect(entries).toHaveLength(0);
    expect(staleSkippedEmployeeNos).toEqual(['E1000']);
  });
});
