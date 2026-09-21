import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs/promises';
import * as iconv from 'iconv-lite';
import * as os from 'os';
import * as path from 'path';
import { FileHrSourceAdapter } from './file-hr-source.adapter';

function fakeConfig(dir: string): ConfigService {
  return { get: () => dir } as unknown as ConfigService;
}

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hr-sync-test-'));
}

const HEADER = 'employeeNo,name,siteCode,department,jobTitle,employmentType,hireDate,resignationDate,contractedWorkMinutes,managerEmployeeNo,effectiveDate';

describe('FileHrSourceAdapter — 완료조건: mock 파일 기반 테스트 통과 + EUC-KR 처리', () => {
  it('UTF-8 CSV를 읽는다', async () => {
    const dir = await makeTmpDir();
    const csv = `${HEADER}\nE1,홍길동,SITE-A,조리팀,팀장,REGULAR,2026-01-02,,,,2026-01-01\n`;
    await fs.writeFile(path.join(dir, 'hr.csv'), csv, 'utf8');

    const adapter = new FileHrSourceAdapter(fakeConfig(dir));
    const records = await adapter.fetchAll('2026-01-01');

    expect(records).toEqual([
      {
        employeeNo: 'E1',
        name: '홍길동',
        siteCode: 'SITE-A',
        department: '조리팀',
        jobTitle: '팀장',
        employmentType: 'REGULAR',
        hireDate: '2026-01-02',
        resignationDate: undefined,
        contractedWorkMinutes: undefined,
        managerEmployeeNo: undefined,
        effectiveDate: '2026-01-01',
      },
    ]);
  });

  it('EUC-KR로 인코딩된 CSV를 한글 깨짐 없이 읽는다', async () => {
    const dir = await makeTmpDir();
    const csv = `${HEADER}\nE2,박영희,SITE-A,인사팀,,REGULAR,2026-01-05,,,,2026-01-01\n`;
    await fs.writeFile(path.join(dir, 'hr-euckr.csv'), iconv.encode(csv, 'euc-kr'));

    const adapter = new FileHrSourceAdapter(fakeConfig(dir));
    const records = await adapter.fetchAll('2026-01-01');

    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('박영희');
    expect(records[0].department).toBe('인사팀');
  });

  it('.xlsx 파일도 읽는다', async () => {
    const dir = await makeTmpDir();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('hr');
    sheet.addRow(HEADER.split(','));
    sheet.addRow(['E3', '이순신', 'SITE-A', '', '', 'DISPATCHED', '2026-01-10', '', '160', '', '2026-01-01']);
    await workbook.xlsx.writeFile(path.join(dir, 'hr.xlsx'));

    const adapter = new FileHrSourceAdapter(fakeConfig(dir));
    const records = await adapter.fetchAll('2026-01-01');

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ employeeNo: 'E3', name: '이순신', employmentType: 'DISPATCHED', contractedWorkMinutes: 160 });
  });

  it('가장 최근 수정된 파일 하나만 읽는다', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'old.csv'), `${HEADER}\nOLD,올드,SITE-A,,,REGULAR,2026-01-01,,,,2026-01-01\n`, 'utf8');
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(dir, 'new.csv'), `${HEADER}\nNEW,뉴,SITE-A,,,REGULAR,2026-01-01,,,,2026-01-01\n`, 'utf8');

    const adapter = new FileHrSourceAdapter(fakeConfig(dir));
    const records = await adapter.fetchAll('2026-01-01');

    expect(records).toHaveLength(1);
    expect(records[0].employeeNo).toBe('NEW');
  });

  it('파일이 없으면 빈 배열을 반환한다', async () => {
    const dir = await makeTmpDir();
    const adapter = new FileHrSourceAdapter(fakeConfig(dir));
    expect(await adapter.fetchAll('2026-01-01')).toEqual([]);
  });
});
