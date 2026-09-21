import { ConfigService } from '@nestjs/config';
import { DbHrSourceAdapter } from './db-hr-source.adapter';
import { DbQueryRunner } from './db-query-runner';

function fakeConfig(query: string | undefined): ConfigService {
  return { get: () => query } as unknown as ConfigService;
}

describe('DbHrSourceAdapter — 완료조건: mock 쿼리 실행 결과 기반 테스트 통과', () => {
  it('설정된 쿼리를 실행하고 컬럼 별칭을 StandardHrRecord로 매핑한다', async () => {
    const runner: DbQueryRunner = {
      query: jest.fn().mockResolvedValue([
        {
          employeeNo: 'E10',
          name: '홍길동',
          siteCode: 'SITE-A',
          department: '조리팀',
          jobTitle: null,
          hireDate: '2026-01-02',
          resignationDate: null,
          employmentType: 'REGULAR',
          contractedWorkMinutes: 160,
          managerEmployeeNo: null,
          effectiveDate: '2026-01-01',
        },
      ]),
    };

    const adapter = new DbHrSourceAdapter(fakeConfig('SELECT * FROM hr_master'), runner);
    const records = await adapter.fetchAll('2026-01-01');

    expect(runner.query).toHaveBeenCalledWith('SELECT * FROM hr_master');
    expect(records).toEqual([
      {
        employeeNo: 'E10',
        name: '홍길동',
        siteCode: 'SITE-A',
        department: '조리팀',
        jobTitle: undefined,
        hireDate: '2026-01-02',
        resignationDate: undefined,
        employmentType: 'REGULAR',
        contractedWorkMinutes: 160,
        managerEmployeeNo: undefined,
        effectiveDate: '2026-01-01',
      },
    ]);
  });

  it('쿼리 설정이 없으면 즉시 실패한다', async () => {
    const runner: DbQueryRunner = { query: jest.fn() };
    const adapter = new DbHrSourceAdapter(fakeConfig(undefined), runner);
    await expect(adapter.fetchAll('2026-01-01')).rejects.toThrow('HR_SYNC_DB_QUERY');
  });
});
