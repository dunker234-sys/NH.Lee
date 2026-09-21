import { normalizeEmploymentType, normalizeHrRecords } from './hr-sync-normalizer';
import { StandardHrRecord } from './hr-sync.types';

function record(overrides: Partial<StandardHrRecord> = {}): StandardHrRecord {
  return {
    employeeNo: 'E1000',
    name: '홍길동',
    siteCode: 'SITE-A',
    hireDate: '2026-01-02',
    employmentType: 'REGULAR',
    effectiveDate: '2026-01-01',
    ...overrides,
  };
}

describe('normalizeEmploymentType', () => {
  it('enum 값 자체와 한국어 표기를 모두 인식한다', () => {
    expect(normalizeEmploymentType('REGULAR')).toBe('REGULAR');
    expect(normalizeEmploymentType('정규직')).toBe('REGULAR');
    expect(normalizeEmploymentType('파견')).toBe('DISPATCHED');
    expect(normalizeEmploymentType('초단시간')).toBe('ULTRA_PART_TIME');
  });

  it('알 수 없는 값은 null을 반환한다', () => {
    expect(normalizeEmploymentType('알수없음')).toBeNull();
  });
});

describe('normalizeHrRecords', () => {
  const siteCodeToId = new Map([['SITE-A', 'site-a-uuid']]);

  it('정상 레코드를 정규화한다', () => {
    const { normalized, rowErrors } = normalizeHrRecords([record()], siteCodeToId);
    expect(rowErrors).toHaveLength(0);
    expect(normalized).toEqual([
      {
        employeeNo: 'E1000',
        name: '홍길동',
        siteId: 'site-a-uuid',
        department: undefined,
        jobTitle: undefined,
        hireDate: '2026-01-02',
        resignationDate: undefined,
        employmentType: 'REGULAR',
        contractedWorkMinutes: undefined,
        managerEmployeeNo: undefined,
        effectiveDate: '2026-01-01',
      },
    ]);
  });

  it('사업장코드 미존재는 ERROR로 분류하고 나머지 행은 계속 처리한다(부분 처리)', () => {
    const { normalized, rowErrors } = normalizeHrRecords(
      [record({ employeeNo: 'BAD', siteCode: 'NO-SUCH-SITE' }), record({ employeeNo: 'OK' })],
      siteCodeToId,
    );
    expect(rowErrors).toEqual([{ employeeNo: 'BAD', message: expect.stringContaining('사업장코드') }]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].employeeNo).toBe('OK');
  });

  it('날짜 형식 오류는 ERROR로 분류된다', () => {
    const { rowErrors } = normalizeHrRecords([record({ hireDate: '2026/01/02' })], siteCodeToId);
    expect(rowErrors[0].message).toContain('입사일');
  });

  it('고용형태 매핑 실패는 ERROR로 분류된다', () => {
    const { rowErrors } = normalizeHrRecords([record({ employmentType: '알수없음' })], siteCodeToId);
    expect(rowErrors[0].message).toContain('고용형태');
  });

  it('사번이 비어 있으면 ERROR로 분류된다', () => {
    const { rowErrors } = normalizeHrRecords([record({ employeeNo: '' })], siteCodeToId);
    expect(rowErrors).toHaveLength(1);
  });
});
