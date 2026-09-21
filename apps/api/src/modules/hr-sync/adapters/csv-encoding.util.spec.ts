import * as iconv from 'iconv-lite';
import { decodeCsvBuffer } from './csv-encoding.util';

describe('decodeCsvBuffer — 완료조건: EUC-KR CSV가 깨짐 없이 처리된다', () => {
  it('UTF-8 BOM이 있으면 UTF-8로 디코딩한다', () => {
    const text = 'employeeNo,name\nE1,홍길동\n';
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
    expect(decodeCsvBuffer(buffer)).toBe(text);
  });

  it('BOM 없는 순수 UTF-8은 그대로 디코딩한다', () => {
    const text = 'employeeNo,name\nE1,김철수\n';
    const buffer = Buffer.from(text, 'utf8');
    expect(decodeCsvBuffer(buffer)).toBe(text);
  });

  it('EUC-KR로 인코딩된 CSV는 자동 판별해 깨짐 없이 디코딩한다', () => {
    const text = 'employeeNo,name,department\nE2,박영희,조리팀\n';
    const buffer = iconv.encode(text, 'euc-kr');
    expect(decodeCsvBuffer(buffer)).toBe(text);
  });
});
